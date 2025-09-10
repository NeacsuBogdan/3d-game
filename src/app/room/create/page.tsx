"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateRoomPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onCreate = async () => {
    setLoading(true);
    setErr(null);
    const res = await fetch("/api/rooms/create", { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Failed to create");
      return;
    }
    const j = await res.json();
    router.replace(`/room/${j.code}`); // lobby route comes next
  };

  return (
    <div className="p-6 max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Create Room</h1>
      <button
        onClick={onCreate}
        className="rounded bg-black text-white px-4 py-2"
        disabled={loading}
      >
        {loading ? "Creating…" : "Create room"}
      </button>
      {err && <p className="text-red-500 text-sm">{err}</p>}
    </div>
  );
}
