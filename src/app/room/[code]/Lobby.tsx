"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

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

const isRoomMemberRow = (v: unknown): v is RoomMemberRow =>
  typeof v === "object" &&
  v !== null &&
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

export default function Lobby({ code }: { code: string }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  // helper: (re)fetch members for a room
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

  // initial fetch
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
      await refetchMembers(roomRow.id);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [code]);

  // realtime subscription for room_members
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
      .subscribe((status) => {
        // Anti-race: dacă INSERT s-a întâmplat înainte să devină SUBSCRIBED, mai facem un fetch.
        if (status === "SUBSCRIBED") {
          void refetchMembers(room.id);
        }
      });

    return () => {
      supabase.removeChannel(ch);
    };
  }, [room?.id]);

  if (loading) return <div className="p-6">Loading lobby…</div>;
  if (err) return <div className="p-6 text-red-500">{err}</div>;
  if (!room) return <div className="p-6">Room not found.</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Room {room.code}</h1>
      <p className="text-sm text-neutral-500">Status: {room.status}</p>

      <div className="border rounded-xl p-4">
        <h2 className="font-semibold mb-2">Seats</h2>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.uid} className="flex items-center justify-between border rounded p-2">
              <span className="font-mono">#{m.seat_index}</span>
              <span className="flex-1 px-3">{m.display_name}</span>
              <span className="text-sm">{m.character_id ?? "—"}</span>
              <span className={`text-xs ml-3 ${m.is_ready ? "text-green-400" : "text-yellow-400"}`}>
                {m.is_ready ? "Ready" : "Not ready"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
