"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import Stage3D, { type StageMember } from "./Stage3D";

/** ---------- Types ---------- */

type Room = {
  id: string;
  code: string;
  status: "lobby" | "playing" | "ended";
  host_uid: string;
};

type Member = {
  uid: string;
  seat_index: number;
  display_name: string;
  character_id: string | null;
  is_ready: boolean;
};

type RoomMemberRow = {
  room_id: string;
  uid: string;
  seat_index: number;
  display_name: string;
  character_id: string | null;
  is_ready: boolean;
};

type CharacterRow = {
  id: string;
  label: string;
  model_url: string | null;
  enabled: boolean;
};

type SubscriptionStatus = "SUBSCRIBED" | "CLOSED" | "CHANNEL_ERROR" | "TIMED_OUT";

/** ---------- Swap events (broadcast) ----------
 *
 * Flow:
 * A clicks B → A sends swap_request(to=B)
 * B Accepts → B sets character_id = null → B sends swap_vacated(vacated_char=B_char, other_char=A_char)
 * A receives swap_vacated → A sets character_id = vacated_char → A sends swap_take_done(initiator_old_char=A_old_char)
 * B receives swap_take_done → B sets character_id = initiator_old_char
 */

type SwapRequest = {
  type: "swap_request";
  room_id: string;
  from_uid: string;
  to_uid: string;
  from_char: string;
  to_char: string;
};

type SwapDecline = {
  type: "swap_decline";
  room_id: string;
  from_uid: string;
  to_uid: string;
};

type SwapVacated = {
  type: "swap_vacated";
  room_id: string;
  vacated_uid: string;
  to_uid: string;
  vacated_char: string;
  other_char: string;
};

type SwapTakeDone = {
  type: "swap_take_done";
  room_id: string;
  from_uid: string;
  to_uid: string;
  initiator_old_char: string;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const isRoomMemberRow = (v: unknown): v is RoomMemberRow =>
  isObject(v) &&
  "uid" in v &&
  "room_id" in v &&
  "seat_index" in v &&
  "display_name" in v &&
  "is_ready" in v;

const toMember = (r: RoomMemberRow): Member => ({
  uid: r.uid,
  seat_index: r.seat_index,
  display_name: r.display_name,
  character_id: r.character_id,
  is_ready: r.is_ready,
});

const hasPgCode = (e: unknown): e is { code: string; message: string } =>
  isObject(e) && typeof e.code === "string" && typeof e.message === "string";

const isSwapRequest = (p: unknown): p is SwapRequest =>
  isObject(p) &&
  p.type === "swap_request" &&
  typeof p.room_id === "string" &&
  typeof p.from_uid === "string" &&
  typeof p.to_uid === "string" &&
  typeof p.from_char === "string" &&
  typeof p.to_char === "string";

const isSwapDecline = (p: unknown): p is SwapDecline =>
  isObject(p) &&
  p.type === "swap_decline" &&
  typeof p.room_id === "string" &&
  typeof p.from_uid === "string" &&
  typeof p.to_uid === "string";

const isSwapVacated = (p: unknown): p is SwapVacated =>
  isObject(p) &&
  p.type === "swap_vacated" &&
  typeof p.room_id === "string" &&
  typeof p.vacated_uid === "string" &&
  typeof p.to_uid === "string" &&
  typeof p.vacated_char === "string" &&
  typeof p.other_char === "string";

const isSwapTakeDone = (p: unknown): p is SwapTakeDone =>
  isObject(p) &&
  p.type === "swap_take_done" &&
  typeof p.room_id === "string" &&
  typeof p.from_uid === "string" &&
  typeof p.to_uid === "string" &&
  typeof p.initiator_old_char === "string";

/** ---------- Component ---------- */

export default function Lobby({ code }: { code: string }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [characters, setCharacters] = useState<CharacterRow[]>([]);
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  const [busyChar, setBusyChar] = useState(false);
  const [busyReady, setBusyReady] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // Swap state
  const [incomingSwap, setIncomingSwap] = useState<SwapRequest | null>(null);
  const [outgoingToUid, setOutgoingToUid] = useState<string | null>(null);
  const [swapNotice, setSwapNotice] = useState<string | null>(null);

  // Presence
  const presenceCleanupRef = useRef<(() => void) | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());

  // Broadcast channel
  const eventsChRef = useRef<RealtimeChannel | null>(null);

  /** ---------- Helpers ---------- */

  const me: Member | undefined = useMemo(
    () => members.find((m) => m.uid === currentUid),
    [members, currentUid]
  );

  const taken = useMemo(
    () => new Set(members.map((m) => m.character_id).filter(Boolean) as string[]),
    [members]
  );

  const availableCharacters = useMemo(
    () => characters.filter((c) => !taken.has(c.id)),
    [characters, taken]
  );

  async function refetchMembers(roomId: string) {
    const { data: mems, error } = await supabase
      .from("room_members")
      .select("uid, seat_index, display_name, character_id, is_ready")
      .eq("room_id", roomId)
      .order("seat_index", { ascending: true });

    if (!error && Array.isArray(mems)) {
      setMembers(
        mems.map((m) => ({
          uid: m.uid,
          seat_index: m.seat_index,
          display_name: m.display_name,
          character_id: m.character_id,
          is_ready: m.is_ready,
        }))
      );
    }
  }

  async function refetchCharacters() {
    const { data, error } = await supabase
      .from("characters")
      .select("id, label, model_url, enabled");
    if (!error && Array.isArray(data)) {
      setCharacters(data.filter((c) => c.enabled));
    }
  }

  /** ---------- Initial load ---------- */
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setErr(null);

      const { data: roomRow, error: roomErr } = await supabase
        .from("rooms")
        .select("id, code, status, host_uid")
        .eq("code", code)
        .maybeSingle();

      if (!active) return;

      if (roomErr || !roomRow) {
        setErr(roomErr?.message ?? "Room not found or you are not a member.");
        setLoading(false);
        return;
      }

      setRoom(roomRow as Room);

      const { data: auth } = await supabase.auth.getUser();
      setCurrentUid(auth.user?.id ?? null);

      await Promise.all([refetchMembers(roomRow.id), refetchCharacters()]);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [code]);

  /** ---------- Realtime: room_members changes ---------- */
  useEffect(() => {
    if (!room?.id) return;

    const ch = supabase
      .channel(`room:${room.id}:members`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_members",
          filter: `room_id=eq.${room.id}`,
        },
        (payload: RealtimePostgresChangesPayload<RoomMemberRow>) => {
          const n = payload.new;
          if (!isRoomMemberRow(n)) return;
          setMembers((prev) => {
            if (prev.some((m) => m.uid === n.uid)) return prev;
            const next = [...prev, toMember(n)];
            next.sort((a, b) => a.seat_index - b.seat_index);
            return next;
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "room_members",
          filter: `room_id=eq.${room.id}`,
        },
        (payload: RealtimePostgresChangesPayload<RoomMemberRow>) => {
          const n = payload.new;
          if (!isRoomMemberRow(n)) return;
          setMembers((prev) =>
            prev
              .map((m) => (m.uid === n.uid ? toMember(n) : m))
              .sort((a, b) => a.seat_index - b.seat_index)
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "room_members",
          filter: `room_id=eq.${room.id}`,
        },
        (payload: RealtimePostgresChangesPayload<RoomMemberRow>) => {
          const o = payload.old;
          if (!isRoomMemberRow(o)) return;
          setMembers((prev) => prev.filter((m) => m.uid !== o.uid));
        }
      )
      .subscribe((status: SubscriptionStatus) => {
        if (status === "SUBSCRIBED") {
          void refetchMembers(room.id);
        }
      });

    return () => {
      supabase.removeChannel(ch);
    };
  }, [room?.id]);

  /** ---------- Presence ---------- */
  useEffect(() => {
    if (!room?.id) return;

    let unsubscribed = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      if (!uid || unsubscribed) return;

      const ch = supabase
        .channel(`room:${room.id}:presence`, { config: { presence: { key: uid } } })
        .on("presence", { event: "sync" }, () => {
          const state = ch.presenceState() as Record<string, unknown[]>;
          setOnline(new Set(Object.keys(state)));
        })
        .subscribe((status: SubscriptionStatus) => {
          if (status === "SUBSCRIBED") {
            void ch.track({ at: Date.now() });
          }
        });

      presenceCleanupRef.current = () => {
        supabase.removeChannel(ch);
      };
    })();

    return () => {
      unsubscribed = true;
      presenceCleanupRef.current?.();
      presenceCleanupRef.current = null;
    };
  }, [room?.id]);

  /** ---------- Broadcast: swap events ---------- */
  useEffect(() => {
    if (!room?.id) return;

    const ch = supabase.channel(`room:${room.id}:events`, { config: { broadcast: { self: true } } });
    eventsChRef.current = ch;

    ch.on("broadcast", { event: "swap_request" }, ({ payload }) => {
      if (!isSwapRequest(payload)) return;
      if (payload.to_uid !== currentUid) return;
      if (incomingSwap || outgoingToUid) return;

      const from = members.find((m) => m.uid === payload.from_uid);
      const to = members.find((m) => m.uid === payload.to_uid);
      if (!from || !to || !from.character_id || !to.character_id) return;

      if (from.character_id !== payload.from_char || to.character_id !== payload.to_char) {
        return;
      }
      setIncomingSwap(payload);
    });

    ch.on("broadcast", { event: "swap_decline" }, ({ payload }) => {
      if (!isSwapDecline(payload)) return;
      if (payload.from_uid !== currentUid) return;
      setOutgoingToUid(null);
      setSwapNotice("Swap declined.");
      window.setTimeout(() => setSwapNotice(null), 2000);
    });

    ch.on("broadcast", { event: "swap_vacated" }, async ({ payload }) => {
      if (!isSwapVacated(payload)) return;
      if (payload.to_uid !== currentUid || !room?.id) return;

      const meNow = members.find((m) => m.uid === currentUid);
      if (!meNow || !meNow.character_id) {
        setOutgoingToUid(null);
        setActionErr("Your character changed — cannot complete swap.");
        return;
      }

      if (meNow.character_id !== payload.other_char) {
        setOutgoingToUid(null);
        setActionErr("Your character changed — cannot complete swap.");
        return;
      }

      setBusyChar(true);
      const { error } = await supabase
        .from("room_members")
        .update({ character_id: payload.vacated_char })
        .eq("room_id", room.id)
        .eq("uid", currentUid)
        .eq("character_id", payload.other_char);
      setBusyChar(false);

      if (error) {
        setOutgoingToUid(null);
        setActionErr(error.message);
        return;
      }

      void ch.send({
        type: "broadcast",
        event: "swap_take_done",
        payload: {
          type: "swap_take_done",
          room_id: room.id,
          from_uid: currentUid,
          to_uid: payload.vacated_uid,
          initiator_old_char: payload.other_char,
        } satisfies SwapTakeDone,
      });

      setOutgoingToUid(null);
      setSwapNotice("Swap completed.");
      window.setTimeout(() => setSwapNotice(null), 2000);
    });

    ch.on("broadcast", { event: "swap_take_done" }, async ({ payload }) => {
      if (!isSwapTakeDone(payload) || !room?.id) return;
      if (payload.to_uid !== currentUid) return;

      const meNow = members.find((m) => m.uid === currentUid);
      if (!meNow || meNow.character_id !== null) {
        return;
      }

      setBusyChar(true);
      const { error } = await supabase
        .from("room_members")
        .update({ character_id: payload.initiator_old_char })
        .eq("room_id", room.id)
        .eq("uid", currentUid)
        .is("character_id", null);
      setBusyChar(false);

      if (error) {
        setActionErr(error.message);
      } else {
        setIncomingSwap(null);
        setSwapNotice("Swap completed.");
        window.setTimeout(() => setSwapNotice(null), 2000);
      }
    });

    ch.subscribe();

    return () => {
      supabase.removeChannel(ch);
      eventsChRef.current = null;
    };
  }, [room?.id, currentUid, members, incomingSwap, outgoingToUid]);

  /** ---------- Actions (self only) ---------- */

  async function onChangeCharacter(newId: string) {
    if (!room?.id || !currentUid) return;
    setActionErr(null);
    setBusyChar(true);
    const { error } = await supabase
      .from("room_members")
      .update({ character_id: newId })
      .eq("room_id", room.id)
      .eq("uid", currentUid);
    setBusyChar(false);

    if (error) {
      if (hasPgCode(error) && error.code === "23505") {
        setActionErr("Character already taken.");
      } else {
        setActionErr(error.message);
      }
    }
  }

  async function onToggleReady() {
    if (!room?.id || !currentUid) return;
    const meNow = members.find((m) => m.uid === currentUid);
    if (!meNow) return;
    setActionErr(null);
    setBusyReady(true);
    const { error } = await supabase
      .from("room_members")
      .update({ is_ready: !meNow.is_ready })
      .eq("room_id", room.id)
      .eq("uid", currentUid);
    setBusyReady(false);

    if (error) {
      setActionErr(error.message);
    }
  }

  function canInitiateSwap(targetUid: string): { ok: boolean; reason?: string } {
    if (!currentUid || !room?.id) return { ok: false, reason: "No room." };
    if (busyChar) return { ok: false, reason: "Busy." };
    if (incomingSwap) return { ok: false, reason: "Respond to incoming swap first." };
    if (outgoingToUid) return { ok: false, reason: "You already have a pending swap." };
    if (targetUid === currentUid) return { ok: false, reason: "Cannot swap with yourself." };
    const meNow = members.find((m) => m.uid === currentUid);
    const other = members.find((m) => m.uid === targetUid);
    if (!meNow || !other) return { ok: false, reason: "Member not found." };
    if (!meNow.character_id || !other.character_id)
      return { ok: false, reason: "Both players must have a character." };
    return { ok: true };
  }

  async function handleClickMember(targetUid: string) {
    if (!eventsChRef.current || !room?.id || !currentUid) return;
    const check = canInitiateSwap(targetUid);
    if (!check.ok) {
      setActionErr(check.reason ?? "Cannot swap.");
      return;
    }

    const meNow = members.find((m) => m.uid === currentUid)!;
    const other = members.find((m) => m.uid === targetUid)!;

    setActionErr(null);
    setOutgoingToUid(targetUid);

    const payload: SwapRequest = {
      type: "swap_request",
      room_id: room.id,
      from_uid: currentUid,
      to_uid: targetUid,
      from_char: meNow.character_id!, // guarded
      to_char: other.character_id!,   // guarded
    };

    await eventsChRef.current.send({
      type: "broadcast",
      event: "swap_request",
      payload,
    });
  }

  async function declineSwap() {
    if (!eventsChRef.current || !incomingSwap || !room?.id) return;

    await eventsChRef.current.send({
      type: "broadcast",
      event: "swap_decline",
      payload: {
        type: "swap_decline",
        room_id: room.id,
        from_uid: incomingSwap.from_uid,
        to_uid: incomingSwap.to_uid,
      } satisfies SwapDecline,
    });

    setIncomingSwap(null);
  }

  async function acceptSwap() {
    if (!eventsChRef.current || !incomingSwap || !room?.id || !currentUid) return;

    const meNow = members.find((m) => m.uid === currentUid);
    if (!meNow || !meNow.character_id) {
      setIncomingSwap(null);
      setActionErr("You don't have a character anymore.");
      return;
    }
    if (meNow.character_id !== incomingSwap.to_char) {
      setIncomingSwap(null);
      setActionErr("Your character changed — request is invalid.");
      return;
    }

    setBusyChar(true);
    const { error } = await supabase
      .from("room_members")
      .update({ character_id: null })
      .eq("room_id", room.id)
      .eq("uid", currentUid)
      .eq("character_id", meNow.character_id);
    setBusyChar(false);

    if (error) {
      setActionErr(error.message);
      setIncomingSwap(null);
      return;
    }

    await eventsChRef.current.send({
      type: "broadcast",
      event: "swap_vacated",
      payload: {
        type: "swap_vacated",
        room_id: room.id,
        vacated_uid: currentUid,
        to_uid: incomingSwap.from_uid,
        vacated_char: meNow.character_id,
        other_char: incomingSwap.from_char,
      } satisfies SwapVacated,
    });

    setIncomingSwap(null);
  }

  /** ---------- Derived UI values (must be before any return to satisfy hooks) ---------- */

  // For my select: include my current char (if set), plus all not taken
  const myOptions: CharacterRow[] = useMemo(() => {
    const myChar = me?.character_id ?? null;
    return characters.filter((c) => c.id === myChar || !taken.has(c.id));
  }, [characters, taken, me?.character_id]);

  const stageMembers: StageMember[] = useMemo(
    () =>
      members.map((m) => ({
        uid: m.uid,
        seat_index: m.seat_index,
        display_name: m.display_name,
        character_id: m.character_id,
        is_ready: m.is_ready,
      })),
    [members]
  );

  /** ---------- UI ---------- */

  if (loading) return <div className="p-6">Loading lobby…</div>;
  if (err) return <div className="p-6 text-red-500">{err}</div>;
  if (!room) return <div className="p-6">Room not found.</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Room {room.code}</h1>
        </div>
        <button
          className="text-xs rounded bg-neutral-800 text-white px-2 py-1"
          onClick={() => navigator.clipboard.writeText(room.code)}
          title="Copy room code"
        >
          Copy
        </button>
      </div>

      {/* Notices */}
      {actionErr && (
        <div className="rounded-md border border-red-800 bg-red-900/20 text-red-300 px-3 py-2 text-sm">
          {actionErr}
        </div>
      )}
      {swapNotice && (
        <div className="rounded-md border border-emerald-800 bg-emerald-900/20 text-emerald-300 px-3 py-2 text-sm">
          {swapNotice}
        </div>
      )}
      {outgoingToUid && (
        <div className="rounded-md border border-yellow-700 bg-yellow-900/20 text-yellow-200 px-3 py-2 text-sm">
          Waiting for{" "}
          <strong>
            {members.find((m) => m.uid === outgoingToUid)?.display_name ?? "opponent"}
          </strong>{" "}
          to respond…
        </div>
      )}
      {incomingSwap && (
        <div className="rounded-md border border-sky-700 bg-sky-900/20 text-sky-200 px-3 py-2 text-sm flex items-center gap-3">
          <span>
            <strong>
              {members.find((m) => m.uid === incomingSwap.from_uid)?.display_name ??
                "Player"}
            </strong>{" "}
            requests a character swap.
          </span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={acceptSwap}
              className="rounded bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 text-sm"
              disabled={busyChar}
            >
              Accept
            </button>
            <button
              onClick={declineSwap}
              className="rounded bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1 text-sm"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* 3D Stage */}
      <div className="border rounded-xl p-3">
        <Stage3D
          members={stageMembers}
          currentUid={currentUid}
          onClickMember={handleClickMember}
        />
      </div>

      {/* Seats + controls */}
      <div className="border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Seats</h2>
        </div>

        <ul className="space-y-2">
          {members.map((m) => {
            const isOnline = online.has(m.uid);
            const isMe = m.uid === currentUid;
            const myCharId = isMe ? me?.character_id ?? "" : "";

            return (
              <li key={m.uid} className="flex items-center gap-3 border rounded p-2">
                <span className="font-mono w-10 text-center">#{m.seat_index}</span>
                <span
                  aria-label={isOnline ? "online" : "offline"}
                  className={`inline-block h-2 w-2 rounded-full ${
                    isOnline ? "bg-green-400" : "bg-neutral-500"
                  }`}
                />
                <span className="flex-1 px-1">{m.display_name}</span>

                <span className="text-sm min-w-24">{m.character_id ?? "—"}</span>

                <span
                  className={`text-xs ${
                    m.is_ready ? "text-green-400" : "text-yellow-400"
                  }`}
                >
                  {m.is_ready ? "Ready" : "Not ready"}
                </span>

                {isMe && (
                  <div className="ml-auto flex items-center gap-2">
                    <select
                      className="border rounded px-2 py-1 text-sm"
                      value={myCharId}
                      onChange={(e) => onChangeCharacter(e.target.value)}
                      disabled={busyChar || Boolean(outgoingToUid) || Boolean(incomingSwap)}
                    >
                      <option value="" disabled>
                        Select character…
                      </option>
                      {myOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>

                    <button
                      className="rounded bg-black text-white px-3 py-1 text-sm"
                      onClick={onToggleReady}
                      disabled={busyReady}
                    >
                      {busyReady ? "…" : m.is_ready ? "Unready" : "Ready"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="text-xs text-neutral-500 pt-2">
          Available characters: {availableCharacters.map((c) => c.label).join(", ") || "none"}
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        Tip: in the 3D stage you can click a teammate to request a swap.
      </p>
    </div>
  );
}
