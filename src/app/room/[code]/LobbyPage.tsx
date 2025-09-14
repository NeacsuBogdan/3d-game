"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import LobbyHeader from "./components/LobbyHeader";
import SwapBanners from "./components/SwapBanners";
import StagePanel from "./components/StagePanel";
import ReadyBar from "./components/ReadyBar";

import { useRoom } from "./hooks/useRoom";
import { useMembers } from "./hooks/useMembers";
import { usePresence } from "./hooks/usePresence";
import { useSwapChannel } from "./hooks/useSwapChannel";
import { useCharacters } from "./hooks/useCharacters";

import type { StageMember } from "./_shared/types";

export default function LobbyPage({ code }: { code: string }) {
  const { room, currentUid, loading, error } = useRoom(code);
  const { members, refresh, updateCharacterGuarded, toggleReady } = useMembers(room?.id ?? null);
  const { characters } = useCharacters();
  const [hostNotice, setHostNotice] = useState<string | null>(null);
  const prevHostUidRef = useRef<string | null>(null);
  const initHostRef = useRef(false);
  // 👉 legăm presence de refresh-ul membrilor (host prinde imediat intrările)
  usePresence(room?.id ?? null, currentUid, refresh);

  const swap = useSwapChannel({
    roomId: room?.id ?? null,
    currentUid,
    members,
    updateCharacterGuarded,
  });

  const handleClickMember = useCallback(
    (uid: string) => swap.requestSwap(uid),
    [swap]
  );

  const [busyReady, setBusyReady] = useState(false);
  const me = useMemo(() => members.find((m) => m.uid === currentUid) ?? null, [members, currentUid]);

  const stageMembers: StageMember[] = useMemo(
    () => members.map((m) => ({
      uid: m.uid,
      seat_index: m.seat_index,
      display_name: m.display_name,
      character_id: m.character_id,
      is_ready: m.is_ready,
    })),
    [members]
  );

  const taken = useMemo(
    () => new Set(members.map((m) => m.character_id).filter(Boolean) as string[]),
    [members]
  );

  const didAutoAssign = useRef(false);
  useEffect(() => {
    if (!room?.id || !currentUid) return;
    if (didAutoAssign.current) return;
    const meNow = members.find((m) => m.uid === currentUid);
    if (!meNow || meNow.character_id) return;
    const available = characters.filter((c) => !taken.has(c.id));
    if (available.length === 0) return;
    didAutoAssign.current = true;
    void updateCharacterGuarded(currentUid, available[0].id, null);
  }, [room?.id, currentUid, members, characters, taken, updateCharacterGuarded]);

  async function onToggleReady() {
    if (!room?.id || !currentUid) return;
    setBusyReady(true);
    const { error: err } = await toggleReady(currentUid);
    setBusyReady(false);
    if (err) console.error("toggleReady error:", err);
  }

    useEffect(() => {
    if (!room || !currentUid) return;

    // host curent (permit null în caz că tabela are host_uid null când rămâne camera goală)
    const hostUidNow: string | null = (room as unknown as { host_uid: string | null }).host_uid ?? null;

    // la prima rulare doar memorăm, nu afișăm banner
    if (!initHostRef.current) {
      initHostRef.current = true;
      prevHostUidRef.current = hostUidNow;
      return;
    }

    // s-a schimbat host-ul?
    if (hostUidNow !== prevHostUidRef.current) {
      // dacă eu sunt noul host → arată mesaj
      if (hostUidNow && hostUidNow === currentUid) {
        setHostNotice("You're now the host.");
        // auto-dismiss după 4s
        const t = setTimeout(() => setHostNotice(null), 4000);
        return () => clearTimeout(t);
      }
      // actualizează referința indiferent dacă sunt sau nu host
      prevHostUidRef.current = hostUidNow;
    }
  }, [room, currentUid]);

  if (loading) return <div className="p-6">Loading lobby…</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;
  if (!room) return <div className="p-6">Room not found.</div>;

  const isHost = room.host_uid === currentUid;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <LobbyHeader code={room.code} status={room.status} isHost={isHost} />

      <SwapBanners
        members={members}
        incoming={swap.incoming}
        outgoingToUid={swap.outgoingToUid}
        notice={swap.notice ?? hostNotice}
        error={swap.error}
        busyAccept={swap.busyAccept}
        onAccept={swap.acceptSwap}
        onDecline={swap.declineSwap}
      />

      <StagePanel
        members={stageMembers}
        currentUid={currentUid}
        onClickMember={handleClickMember}
      />

      <ReadyBar isReady={Boolean(me?.is_ready)} onToggle={onToggleReady} busy={busyReady} />
    </div>
  );
}
