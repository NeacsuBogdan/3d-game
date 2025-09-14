import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { makePresenceChannel } from "../_shared/supa";

export function usePresence(
  roomId: string | null,
  currentUid: string | null,
  onSync?: () => void
) {
  const [online, setOnline] = useState<Set<string>>(new Set());

  // Auto-leave la închidere/navigare
  useEffect(() => {
    if (!roomId || !currentUid) return;

    const sendLeave = () => {
      try {
        const blob = new Blob([JSON.stringify({ roomId })], { type: "application/json" });
        const ok = navigator.sendBeacon("/api/rooms/leave", blob);
        if (!ok) {
          void fetch("/api/rooms/leave", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId }),
            keepalive: true,
          });
        }
      } catch {
        // ignore
      }
    };

    const onPageHide = () => sendLeave();
    const onBeforeUnload = () => sendLeave();

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      sendLeave();
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [roomId, currentUid]);

  // Presence realtime (+ trigger refresh pe sync)
  useEffect(() => {
    if (!roomId || !currentUid) return;

    const ch = makePresenceChannel(roomId, currentUid)
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState() as Record<string, unknown[]>;
        setOnline(new Set(Object.keys(state)));
        onSync?.(); // 👉 forțează un refresh al membrilor la fiecare sync
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void ch.track({ at: Date.now() });
        }
      });

    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, currentUid, onSync]);

  return { online } as const;
}
