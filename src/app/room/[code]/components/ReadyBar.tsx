"use client";

export default function ReadyBar({
  isReady,
  onToggle,
  busy = false,
}: {
  isReady: boolean;
  onToggle: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center justify-center">
      <button
        onClick={onToggle}
        disabled={busy}
        className={`px-6 py-3 rounded-lg text-white font-semibold shadow
          ${isReady ? "bg-emerald-600 hover:bg-emerald-500" : "bg-indigo-600 hover:bg-indigo-500"}
          disabled:opacity-60 disabled:cursor-not-allowed
        `}
      >
        {busy ? "…" : isReady ? "Unready" : "Ready"}
      </button>
    </div>
  );
}
