import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { makeEventsChannel } from "../_shared/supa";
import {
  EVT_SWAP_DECLINE,
  EVT_SWAP_REQUEST,
  EVT_SWAP_TAKE_DONE,
  EVT_SWAP_VACATED,
  isSwapDecline,
  isSwapRequest,
  isSwapTakeDone,
  isSwapVacated,
} from "../_shared/events";
import type { Member, SwapRequest } from "../_shared/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Deps = {
  roomId: string | null;
  currentUid: string | null;
  members: Member[];
  updateCharacterGuarded: (
    uid: string,
    nextId: string | null,
    prevId: string | null
  ) => Promise<{ error?: string }>;
};

export function useSwapChannel({
  roomId,
  currentUid,
  members,
  updateCharacterGuarded,
}: Deps) {
  const [incoming, setIncoming] = useState<SwapRequest | null>(null);
  const [outgoingToUid, setOutgoingToUid] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAccept, setBusyAccept] = useState(false);

  const chRef = useRef<RealtimeChannel | null>(null);

  // avem nevoie de ultima stare a membrilor în handler-ele async
  const membersRef = useRef<Member[]>(members);
  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  // mic utilitar: așteaptă până când `check()` devine true sau expiră
  const waitFor = useCallback(
    async (check: () => boolean, timeoutMs = 2000, stepMs = 50) => {
      const start = performance.now();
      while (performance.now() - start < timeoutMs) {
        if (check()) return true;
        await new Promise((r) => setTimeout(r, stepMs));
      }
      return check();
    },
    []
  );

  useEffect(() => {
    if (!roomId) return;

    const ch = makeEventsChannel(roomId, true);
    chRef.current = ch;

    ch.on("broadcast", { event: EVT_SWAP_REQUEST }, ({ payload }) => {
      if (!isSwapRequest(payload)) return;
      if (payload.to_uid !== currentUid) return;
      if (incoming || outgoingToUid) return;

      const from = membersRef.current.find((m) => m.uid === payload.from_uid);
      const to = membersRef.current.find((m) => m.uid === payload.to_uid);
      if (!from || !to || !from.character_id || !to.character_id) return;
      if (from.character_id !== payload.from_char || to.character_id !== payload.to_char) return;

      setIncoming(payload);
    });

    ch.on("broadcast", { event: EVT_SWAP_DECLINE }, ({ payload }) => {
      if (!isSwapDecline(payload)) return;
      if (payload.from_uid !== currentUid) return;
      setOutgoingToUid(null);
      setNotice("Swap declined.");
      window.setTimeout(() => setNotice(null), 1500);
    });

    ch.on("broadcast", { event: EVT_SWAP_VACATED }, async ({ payload }) => {
      if (!isSwapVacated(payload) || !roomId) return;
      // mesaj către inițiatorul A: B a eliberat
      if (payload.to_uid !== currentUid) return;

      const meNow = membersRef.current.find((m) => m.uid === currentUid);
      if (!meNow || !meNow.character_id) {
        setOutgoingToUid(null);
        setError("Your character changed — cannot complete swap.");
        return;
      }
      if (meNow.character_id !== payload.other_char) {
        setOutgoingToUid(null);
        setError("Your character changed — cannot complete swap.");
        return;
      }

      // ✅ așteaptă ca DB să reflecte că B (vacated_uid) are character_id NULL
      const ok = await waitFor(() => {
        const vac = membersRef.current.find((m) => m.uid === payload.vacated_uid);
        return !!vac && vac.character_id === null;
      }, 2000, 40);

      if (!ok) {
        setOutgoingToUid(null);
        setError("Swap failed: seat not vacated in time.");
        return;
      }

      // încearcă să iei caracterul lui B
      let up = await updateCharacterGuarded(currentUid!, payload.vacated_char, payload.other_char);

      // dacă a apărut o condiție de cursă rară (ex. replicare evenimente), mai încearcă o dată
      if (up.error) {
        await new Promise((r) => setTimeout(r, 150));
        const ok2 = await waitFor(() => {
          const vac = membersRef.current.find((m) => m.uid === payload.vacated_uid);
          return !!vac && vac.character_id === null;
        }, 1500, 40);
        if (!ok2) {
          setOutgoingToUid(null);
          setError("Swap failed.");
          return;
        }
        up = await updateCharacterGuarded(currentUid!, payload.vacated_char, payload.other_char);
      }

      if (up.error) {
        setOutgoingToUid(null);
        setError(up.error);
        return;
      }

      // confirmă la B să-și ia caracterul meu vechi
      void ch.send({
        type: "broadcast",
        event: EVT_SWAP_TAKE_DONE,
        payload: {
          type: EVT_SWAP_TAKE_DONE,
          room_id: roomId,
          from_uid: currentUid,
          to_uid: payload.vacated_uid,
          initiator_old_char: payload.other_char,
        },
      });

      setOutgoingToUid(null);
      setNotice("Swap completed.");
      window.setTimeout(() => setNotice(null), 1500);
    });

    ch.on("broadcast", { event: EVT_SWAP_TAKE_DONE }, async ({ payload }) => {
      if (!isSwapTakeDone(payload) || !roomId) return;
      // mesaj către B: poate să-și ia vechiul caracter al lui A
      if (payload.to_uid !== currentUid) return;

      const meNow = membersRef.current.find((m) => m.uid === currentUid);
      if (!meNow || meNow.character_id !== null) return;

      const up = await updateCharacterGuarded(
        currentUid!,
        payload.initiator_old_char,
        null
      );
      if (up.error) setError(up.error);
      else {
        setIncoming(null);
        setNotice("Swap completed.");
        window.setTimeout(() => setNotice(null), 1500);
      }
    });

    ch.subscribe();

    return () => {
      supabase.removeChannel(ch);
      chRef.current = null;
    };
  }, [roomId, currentUid, incoming, outgoingToUid, waitFor, updateCharacterGuarded]);

  const requestSwap = useCallback(
    async (targetUid: string) => {
      if (!roomId || !currentUid) return;
      if (incoming || outgoingToUid) {
        setError("Resolve current swap first.");
        return;
      }
      if (targetUid === currentUid) {
        setError("Cannot swap with yourself.");
        return;
      }

      const meNow = membersRef.current.find((m) => m.uid === currentUid);
      const other = membersRef.current.find((m) => m.uid === targetUid);
      if (!meNow || !other || !meNow.character_id || !other.character_id) {
        setError("Both players must have a character.");
        return;
      }

      setOutgoingToUid(targetUid);
      await chRef.current?.send({
        type: "broadcast",
        event: EVT_SWAP_REQUEST,
        payload: {
          type: EVT_SWAP_REQUEST,
          room_id: roomId,
          from_uid: currentUid,
          to_uid: targetUid,
          from_char: meNow.character_id,
          to_char: other.character_id,
        },
      });
    },
    [roomId, currentUid, incoming, outgoingToUid]
  );

  const declineSwap = useCallback(async () => {
    if (!roomId || !incoming) return;
    await chRef.current?.send({
      type: "broadcast",
      event: EVT_SWAP_DECLINE,
      payload: {
        type: EVT_SWAP_DECLINE,
        room_id: roomId,
        from_uid: incoming.from_uid,
        to_uid: incoming.to_uid,
      },
    });
    setIncoming(null);
  }, [roomId, incoming]);

  const acceptSwap = useCallback(async () => {
    if (!roomId || !currentUid || !incoming) return;

    const meNow = membersRef.current.find((m) => m.uid === currentUid);
    if (!meNow || !meNow.character_id) {
      setIncoming(null);
      setError("You don't have a character anymore.");
      return;
    }
    if (meNow.character_id !== incoming.to_char) {
      setIncoming(null);
      setError("Your character changed — request is invalid.");
      return;
    }

    setBusyAccept(true);
    // B își eliberează caracterul (set NULL) cu guard
    const up = await updateCharacterGuarded(
      currentUid,
      null,
      meNow.character_id
    );
    setBusyAccept(false);

    if (up.error) {
      setError(up.error);
      setIncoming(null);
      return;
    }

    // notifică inițiatorul A că poate lua caracterul eliberat
    await chRef.current?.send({
      type: "broadcast",
      event: EVT_SWAP_VACATED,
      payload: {
        type: EVT_SWAP_VACATED,
        room_id: roomId,
        vacated_uid: currentUid,
        to_uid: incoming.from_uid,
        vacated_char: meNow.character_id,
        other_char: incoming.from_char,
      },
    });

    setIncoming(null);
  }, [roomId, currentUid, incoming, updateCharacterGuarded]);

  return {
    incoming,
    outgoingToUid,
    notice,
    error,
    busyAccept,
    requestSwap,
    acceptSwap,
    declineSwap,
  } as const;
}
