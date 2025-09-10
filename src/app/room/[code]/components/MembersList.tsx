"use client";

import type { CharacterRow, Member } from "../_shared/types";

export default function MembersList({
  members,
  currentUid,
  online,
  characters,
  taken,
  onChangeCharacter,
  onToggleReady,
  busyChar = false,
  busyReady = false,
}: {
  members: Member[];
  currentUid: string | null;
  online: Set<string>;
  characters: CharacterRow[];
  taken: Set<string>;
  onChangeCharacter: (newId: string) => void; // for current user only
  onToggleReady: () => void;                   // for current user only
  busyChar?: boolean;
  busyReady?: boolean;
}) {
  return (
    <ul className="space-y-2">
      {members.map((m) => {
        const isOnline = online.has(m.uid);
        const isMe = m.uid === currentUid;

        // For me: include my current char (if any), plus all not taken
        const myCharId = isMe ? m.character_id ?? "" : "";
        const myOptions = isMe
          ? characters.filter((c) => c.id === myCharId || !taken.has(c.id))
          : [];

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
              className={`text-xs ${m.is_ready ? "text-green-400" : "text-yellow-400"}`}
            >
              {m.is_ready ? "Ready" : "Not ready"}
            </span>

            {isMe && (
              <div className="ml-auto flex items-center gap-2">
                <select
                  className="border rounded px-2 py-1 text-sm"
                  value={myCharId}
                  onChange={(e) => onChangeCharacter(e.target.value)}
                  disabled={busyChar}
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
  );
}
