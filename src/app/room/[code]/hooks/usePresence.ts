import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { makePresenceChannel } from "../_shared/supa";

export function usePresence(roomId: string | null, currentUid: string | null) {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!roomId || !currentUid) return;

    const ch = makePresenceChannel(roomId, currentUid)
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState() as Record<string, unknown[]>;
        setOnline(new Set(Object.keys(state)));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void ch.track({ at: Date.now() });
        }
      });

    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, currentUid]);

  return { online } as const;
}
