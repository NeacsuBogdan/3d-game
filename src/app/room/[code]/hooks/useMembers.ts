import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Member, RoomMemberRow } from "../_shared/types";
import { isRoomMemberRow, toMember, makeMembersChannel } from "../_shared/supa";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export function useMembers(roomId: string | null) {
  const [members, setMembers] = useState<Member[]>([]);

  const refresh = useCallback(async () => {
    if (!roomId) return;
    const { data, error } = await supabase
      .from("room_members")
      .select("uid, seat_index, display_name, character_id, is_ready")
      .eq("room_id", roomId)
      .order("seat_index", { ascending: true });

    if (!error && Array.isArray(data)) {
      setMembers(
        data.map((m) => ({
          uid: m.uid,
          seat_index: m.seat_index,
          display_name: m.display_name,
          character_id: m.character_id,
          is_ready: m.is_ready,
        }))
      );
    }
  }, [roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!roomId) return;
    const ch = makeMembersChannel(roomId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` },
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
        { event: "UPDATE", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` },
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
        { event: "DELETE", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` },
        (payload: RealtimePostgresChangesPayload<RoomMemberRow>) => {
          const o = payload.old;
          if (!isRoomMemberRow(o)) return;
          setMembers((prev) => prev.filter((m) => m.uid !== o.uid));
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void refresh();
        }
      });

    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, refresh]);

  const updateCharacter = useCallback(
    async (uid: string, nextId: string | null) => {
      if (!roomId) return { error: "No room." };

      // optimistic
      const prev = members;
      setMembers((p) => p.map((m) => (m.uid === uid ? { ...m, character_id: nextId } : m)));

      const { error } = await supabase
        .from("room_members")
        .update({ character_id: nextId })
        .eq("room_id", roomId)
        .eq("uid", uid);

      if (error) {
        // revert on error
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

      // optimistic
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

  return { members, refresh, updateCharacter, updateCharacterGuarded, toggleReady } as const;
}
