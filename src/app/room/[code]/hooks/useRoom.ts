import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Room } from "../_shared/types";

export function useRoom(code: string) {
  const [room, setRoom] = useState<Room | null>(null);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    return () => { alive = false; };
  }, [code]);

  return { room, currentUid, loading, error } as const;
}
