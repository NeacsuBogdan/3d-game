"use client";
import type { Room } from "../_shared/types";

export default function LobbyHeader({
  code,
  status,
  isHost,
}: {
  code: string;
  status: Room["status"];
  isHost: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold">Room {code}</h1>
        <p className="text-sm text-neutral-500">
          Status: {status}
          {isHost ? " • Host" : ""}
        </p>
      </div>
      <button
        className="text-xs rounded bg-neutral-800 text-white px-2 py-1"
        onClick={() => navigator.clipboard.writeText(code)}
        title="Copy room code"
      >
        Copy
      </button>
    </div>
  );
}
