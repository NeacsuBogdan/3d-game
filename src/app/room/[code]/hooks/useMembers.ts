import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Member, RoomMemberRow } from "../_shared/types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/** map row -> Member */
function toMember(r: RoomMemberRow): Member {
  return {
    uid: r.uid,
    seat_index: r.seat_index,
    display_name: r.display_name,
    character_id: r.character_id,
    is_ready: r.is_ready,
  };
}

/** guard tolerant pe câmpurile pe care le folosim */
function isRoomMemberRowLike(x: unknown): x is RoomMemberRow {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r["uid"] === "string" &&
    typeof r["seat_index"] === "number" &&
    typeof r["display_name"] === "string" &&
    "character_id" in r &&
    typeof r["is_ready"] === "boolean"
  );
}

export function useMembers(roomId: string | null) {
  const [members, setMembers] = useState<Member[]>([]);
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  const refresh = useCallback(async () => {
    const rid = roomIdRef.current;
    if (!rid) return;
    const { data, error } = await supabase
      .from("room_members")
      .select("room_id, uid, seat_index, display_name, character_id, is_ready")
      .eq("room_id", rid)
      .order("seat_index", { ascending: true });

    if (!error && Array.isArray(data)) {
      setMembers(data.map(toMember));
    }
  }, []);

  // initial + la schimbarea camerei
  useEffect(() => {
    void refresh();
  }, [refresh, roomId]);

  // mic debounce pt refresh-forțat
  const refreshDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRefresh = useCallback(
    (delay = 120) => {
      if (refreshDebounce.current) clearTimeout(refreshDebounce.current);
      refreshDebounce.current = setTimeout(() => {
        refreshDebounce.current = null;
        void refresh();
      }, delay);
    },
    [refresh]
  );

  // subscribe la Realtime (INSERT/UPDATE/DELETE) + burst catch-up
  useEffect(() => {
    if (!roomId) {
      setMembers([]);
      return;
    }

    const channelName = `room:${roomId}:members:${Math.random().toString(36).slice(2)}`;
    const ch = supabase.channel(channelName);

    const onInsert = (payload: RealtimePostgresChangesPayload<RoomMemberRow>) => {
      const n = payload.new;
      if (!isRoomMemberRowLike(n)) return;
      setMembers((prev) => {
        if (prev.some((m) => m.uid === n.uid)) return prev;
        const next = [...prev, toMember(n)];
        next.sort((a, b) => a.seat_index - b.seat_index);
        return next;
      });
      // uneori insertul e văzut de clientul nou înaintea host-ului;
      // forțăm un snapshot ca plasă de siguranță (idempotent)
      queueRefresh(0);
    };

    const onUpdate = (payload: RealtimePostgresChangesPayload<RoomMemberRow>) => {
      const n = payload.new;
      if (!isRoomMemberRowLike(n)) return;
      setMembers((prev) =>
        prev.map((m) => (m.uid === n.uid ? toMember(n) : m)).sort((a, b) => a.seat_index - b.seat_index)
      );
      // dacă un UPDATE intermediar a lipsit, readucem snapshot
      queueRefresh(150);
    };

    const onDelete = (payload: RealtimePostgresChangesPayload<RoomMemberRow>) => {
      const o = payload.old;
      if (!isRoomMemberRowLike(o)) return;
      setMembers((prev) => prev.filter((m) => m.uid !== o.uid));
      queueRefresh(0);
    };

    ch.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` },
      onInsert
    )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` },
        onUpdate
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` },
        onDelete
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // sincronizăm snapshot imediat (acoperă host deschis mai devreme)
          void refresh();
        }
      });

    // “burst catch-up” primele 5 secunde (1/s), ca să prindem orice rând ratat
    const burst = setInterval(() => void refresh(), 1000);
    const stopBurst = setTimeout(() => clearInterval(burst), 5000);

    return () => {
      if (refreshDebounce.current) {
        clearTimeout(refreshDebounce.current);
        refreshDebounce.current = null;
      }
      clearInterval(burst);
      clearTimeout(stopBurst);
      supabase.removeChannel(ch);
    };
  }, [roomId, refresh, queueRefresh]);

  // --- mutatori (neschimbate) ---

  const updateCharacter = useCallback(
    async (uid: string, nextId: string | null) => {
      if (!roomId) return { error: "No room." };

      const prev = members;
      setMembers((p) => p.map((m) => (m.uid === uid ? { ...m, character_id: nextId } : m)));

      const { error } = await supabase
        .from("room_members")
        .update({ character_id: nextId })
        .eq("room_id", roomId)
        .eq("uid", uid);

      if (error) {
        setMembers(prev);
        return { error: error.message };
      }
      return { error: undefined };
    },
    [roomId, members]
  );

  const updateCharacterGuarded = useCallback(
    async (uid: string, nextId: string | null, prevId: string | null) => {
      if (!roomId) return { error: "No room." };

      const prev = members;
      setMembers((p) => p.map((m) => (m.uid === uid ? { ...m, character_id: nextId } : m)));

      let q = supabase
        .from("room_members")
        .update({ character_id: nextId })
        .eq("room_id", roomId)
        .eq("uid", uid);
      q = prevId === null ? q.is("character_id", null) : q.eq("character_id", prevId);

      const { error } = await q;

      if (error) {
        setMembers(prev);
        return { error: error.message };
      }
      return { error: undefined };
    },
    [roomId, members]
  );

  const toggleReady = useCallback(
    async (uid: string) => {
      if (!roomId) return { error: "No room." };
      const me = members.find((m) => m.uid === uid);
      if (!me) return { error: "Member not found." };

      const prev = members;
      setMembers((p) => p.map((m) => (m.uid === uid ? { ...m, is_ready: !m.is_ready } : m)));

      const { error } = await supabase
        .from("room_members")
        .update({ is_ready: !me.is_ready })
        .eq("room_id", roomId)
        .eq("uid", uid);

      if (error) {
        setMembers(prev);
        return { error: error.message };
      }
      return { error: undefined };
    },
    [roomId, members]
  );

  // handy map
  const byUid = useMemo(() => new Map(members.map((m) => [m.uid, m])), [members]);

  return { members, byUid, refresh, updateCharacter, updateCharacterGuarded, toggleReady } as const;
}
