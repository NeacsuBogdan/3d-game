"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Member, SwapRequest, SwapVacated, SwapTakeDone } from "../_shared/types";

/**
 * Handshake fără SQL custom, cu semnalizare clară pentru UI:
 * 1) B (acceptor) își vacatează slotul -> null  + broadcast "swap_vacated"
 * 2) A (inițiator) ia acel char           + broadcast "swap_take_done"
 * 3) B își ia charul inițiatorului         + broadcast "swap_done"
 *
 * Notă: UI-ul <SwapBanners/> afișează deja un banner când outgoingToUid != null
 * (ex. “Waiting {name} to respond…”). Ca să evităm DUBLAREA, NU setăm `notice`
 * în `requestSwap`. `notice` îl folosim doar pentru rezultate (“declined” /
 * “completed”) sau erori.
 */

type SwapDeps = {
  roomId: string | null;
  currentUid: string | null;
  members: Member[];
  updateCharacterGuarded: (
    uid: string,
    nextId: string | null,
    prevId: string | null
  ) => Promise<{ error?: string }>;
};

type DeclineMsg = { from_uid: string; to_uid: string; reason?: string };
type DoneMsg = { a_uid: string; b_uid: string };

export function useSwapChannel({
  roomId,
  currentUid,
  members,
  updateCharacterGuarded,
}: SwapDeps) {
  const [incoming, setIncoming] = useState<SwapRequest | null>(null);
  const [outgoingToUid, setOutgoingToUid] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAccept, setBusyAccept] = useState(false);

  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const me = useMemo(
    () => members.find((m) => m.uid === currentUid) ?? null,
    [members, currentUid]
  );

  const getChar = useCallback(
    (uid: string | null | undefined): string | null => {
      if (!uid) return null;
      return members.find((m) => m.uid === uid)?.character_id ?? null;
    },
    [members]
  );

  // Subscribe broadcast
  useEffect(() => {
    if (!roomId || !currentUid) return;

    const ch = supabase.channel(`room:${roomId}:events`, {
      config: { broadcast: { self: false } },
    });

    // Cerere de swap (A -> B)
    ch.on("broadcast", { event: "swap_request" }, (ev) => {
      const req = (ev.payload ?? {}) as SwapRequest;
      if (
        !req ||
        req.type !== "swap_request" ||
        req.room_id !== roomId ||
        req.to_uid !== currentUid
      ) {
        return;
      }
      setIncoming(req);
      setNotice(null);
      setError(null);
    });

    // Refuz
    ch.on("broadcast", { event: "swap_decline" }, (ev) => {
      const p = (ev.payload ?? {}) as DeclineMsg;
      if (!p.from_uid || !p.to_uid) return;
      // dacă EU sunt inițiatorul refuzat
      if (p.from_uid === currentUid) {
        setOutgoingToUid(null);
        setIncoming(null);
        setNotice("Swap declined.");
        if (p.reason) setError(p.reason);
      }
    });

    // Pasul 2: inițiatorul (A) ia caracterul vacat de B
    ch.on("broadcast", { event: "swap_vacated" }, async (ev) => {
      const msg = (ev.payload ?? {}) as SwapVacated;
      if (!msg || msg.to_uid !== currentUid || msg.room_id !== roomId) return;

      const a = members.find((m) => m.uid === currentUid);
      if (!a) return;

      const aChar = a.character_id;       // ce avea A înainte
      const bChar = msg.vacated_char;     // char-ul lui B (acum liber)

      // Guard: iau bChar doar dacă încă am aChar
      const r = await updateCharacterGuarded(currentUid!, bChar, aChar);
      if (r.error) {
        // anunțăm acceptorul să revină (decline cu motiv)
        const decline: DeclineMsg = { from_uid: currentUid!, to_uid: msg.vacated_uid, reason: r.error };
        chRef.current?.send({ type: "broadcast", event: "swap_decline", payload: decline });
        return;
      }

      // anunțăm acceptorul să finalizeze
      const doneStep: SwapTakeDone = {
        type: "swap_take_done",
        room_id: msg.room_id,
        from_uid: currentUid!,           // inițiator
        to_uid: msg.vacated_uid,         // acceptor
        initiator_old_char: aChar ?? "",
      };
      chRef.current?.send({ type: "broadcast", event: "swap_take_done", payload: doneStep });

      // nu setăm “Swap in progress…” ca notice; lăsăm UI-ul să afișeze doar bannerul de outgoing
    });

    // Pasul 3: acceptorul (B) își ia charul inițiatorului și confirmă finalizarea
    ch.on("broadcast", { event: "swap_take_done" }, async (ev) => {
      const msg = (ev.payload ?? {}) as SwapTakeDone;
      if (!msg || msg.to_uid !== currentUid || msg.room_id !== roomId) return;

      // Eu sunt acceptorul: eram null -> trebuie să iau initiator_old_char
      const r = await updateCharacterGuarded(currentUid!, msg.initiator_old_char || null, null);
      if (r.error) {
        setError(r.error);
        setNotice(null);
        setBusyAccept(false);
        return;
      }

      // confirmă tuturor că s-a încheiat
      const done: DoneMsg = { a_uid: msg.from_uid, b_uid: msg.to_uid };
      chRef.current?.send({ type: "broadcast", event: "swap_done", payload: done });

      // local (acceptor)
      setBusyAccept(false);
      setIncoming(null);
      setNotice("Swap completed.");
      setError(null);
    });

    // Finalizare (pentru inițiator și martori)
    ch.on("broadcast", { event: "swap_done" }, (ev) => {
      const p = (ev.payload ?? {}) as DoneMsg;
      if (!p.a_uid || !p.b_uid) return;
      if (p.a_uid === currentUid || p.b_uid === currentUid) {
        // inițiatorul curăță bannerul “waiting…” și primește mesajul final
        setOutgoingToUid(null);
        setIncoming(null);
        setNotice("Swap completed.");
        setError(null);
      }
    });

    ch.subscribe();
    chRef.current = ch;

    return () => {
      chRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [roomId, currentUid, members, updateCharacterGuarded]);

  // Inițiază cererea (A -> B)
  const requestSwap = useCallback(
    (toUid: string) => {
      if (!roomId || !currentUid) return;
      if (toUid === currentUid) return;

      const from_char = getChar(currentUid) ?? "";
      const to_char = getChar(toUid) ?? "";

      const req: SwapRequest = {
        type: "swap_request",
        room_id: roomId,
        from_uid: currentUid,
        to_uid: toUid,
        from_char,
        to_char,
      };

      // NU setăm notice aici ca să nu dublăm mesajele cu bannerul “waiting X…”
      setOutgoingToUid(toUid);
      setError(null);

      chRef.current?.send({
        type: "broadcast",
        event: "swap_request",
        payload: req,
      });
    },
    [roomId, currentUid, getChar]
  );

  // Refuz
  const declineSwap = useCallback(() => {
    if (!roomId || !currentUid || !incoming) return;

    const msg: DeclineMsg = { from_uid: incoming.from_uid, to_uid: currentUid };
    chRef.current?.send({ type: "broadcast", event: "swap_decline", payload: msg });

    setIncoming(null);
    setNotice(null);
  }, [roomId, currentUid, incoming]);

  // Accept (B)
  const acceptSwap = useCallback(async () => {
    if (!roomId || !currentUid || !incoming) return;
    setBusyAccept(true);
    setError(null);

    // B = eu (acceptor), A = incoming.from_uid (inițiator)
    const b = members.find((m) => m.uid === currentUid);
    const a = members.find((m) => m.uid === incoming.from_uid);

    if (!a || !b) {
      setBusyAccept(false);
      setError("Members not found.");
      return;
    }

    const bChar = b.character_id;
    const aChar = a.character_id;

    // 1) Eu (B) îmi eliberez slotul (-> null) cu guard pe ce aveam
    const r1 = await updateCharacterGuarded(currentUid, null, bChar);
    if (r1.error) {
      setBusyAccept(false);
      setError(r1.error);
      return;
    }

    // 2) Anunț inițiatorul să “take”
    const vacated: SwapVacated = {
      type: "swap_vacated",
      room_id: roomId!,
      vacated_uid: currentUid,
      to_uid: a.uid,
      vacated_char: bChar ?? "",
      other_char: aChar ?? "",
    };
    chRef.current?.send({ type: "broadcast", event: "swap_vacated", payload: vacated });

    // Așteptăm pasul 3 (“swap_take_done” -> eu finalizez și trimit “swap_done”)
    // busyAccept se resetează în handlerul de mai sus
  }, [roomId, currentUid, incoming, members, updateCharacterGuarded]);

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
