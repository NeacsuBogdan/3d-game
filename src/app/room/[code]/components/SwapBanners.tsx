"use client";
import type { Member, SwapRequest } from "../_shared/types";

export default function SwapBanners({
  members,
  incoming,
  outgoingToUid,
  notice,
  error,
  busyAccept = false,
  onAccept,
  onDecline,
}: {
  members: Member[];
  incoming: SwapRequest | null;
  outgoingToUid: string | null;
  notice: string | null;
  error: string | null;
  busyAccept?: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <>
      {error && (
        <div className="rounded-md border border-red-800 bg-red-900/20 text-red-300 px-3 py-2 text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-emerald-800 bg-emerald-900/20 text-emerald-300 px-3 py-2 text-sm">
          {notice}
        </div>
      )}
      {outgoingToUid && (
        <div className="rounded-md border border-yellow-700 bg-yellow-900/20 text-yellow-200 px-3 py-2 text-sm">
          Waiting for{" "}
          <strong>
            {members.find((m) => m.uid === outgoingToUid)?.display_name ?? "player"}
          </strong>{" "}
          to respond…
        </div>
      )}
      {incoming && (
        <div className="rounded-md border border-sky-700 bg-sky-900/20 text-sky-200 px-3 py-2 text-sm flex items-center gap-3">
          <span>
            <strong>
              {members.find((m) => m.uid === incoming.from_uid)?.display_name ??
                "Player"}
            </strong>{" "}
            requests a character swap.
          </span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={onAccept}
              className="rounded bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 text-sm"
              disabled={busyAccept}
            >
              Accept
            </button>
            <button
              onClick={onDecline}
              className="rounded bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1 text-sm"
            >
              Decline
            </button>
          </div>
        </div>
      )}
    </>
  );
}
