import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Room } from "../_shared/types";

type UseRoomResult = {
  room: Room | null;
  currentUid: string | null;
  loading: boolean;
  error: string | null;
};

export function useRoom(code: string): UseRoomResult {
  const [room, setRoom] = useState<Room | null>(null);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch inițial după code + user id
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);

      const { data: roomRow, error: roomErr } = await supabase
        .from("rooms")
        .select("id, code, status, host_uid")
        .eq("code", code.toUpperCase())
        .maybeSingle();

      if (!alive) return;

      if (roomErr || !roomRow) {
        setError(roomErr?.message ?? "Room not found or you are not a member.");
        setRoom(null);
        setCurrentUid(null);
        setLoading(false);
        return;
      }

      setRoom(roomRow as Room);

      const { data: auth } = await supabase.auth.getUser();
      if (!alive) return;

      setCurrentUid(auth.user?.id ?? null);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [code]);

  const roomId = room?.id ?? null;

  // Realtime: update pe rooms(id=...) pentru status/host_uid
  useEffect(() => {
    if (!roomId) return;

    const ch = supabase
      .channel(`room:${roomId}:room-rt`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const next = payload.new as Partial<Pick<Room, "status" | "host_uid">>;
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  status: (next.status ?? prev.status) as Room["status"],
                  host_uid:
                    typeof next.host_uid === "string" || next.host_uid === null
                      ? next.host_uid
                      : prev.host_uid,
                }
              : prev
          );
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Catch-up sigur la abonare
          const { data } = await supabase
            .from("rooms")
            .select("id, code, status, host_uid")
            .eq("id", roomId)
            .maybeSingle();
          if (data) setRoom(data as Room);
        }
      });

    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId]);

  return { room, currentUid, loading, error } as const;
}
