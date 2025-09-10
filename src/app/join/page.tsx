"use client";

import { useState } from "react";
import Protected from "@/components/Protected";
import { useRouter } from "next/navigation";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.toUpperCase().replace(/[^A-Z]/g, "");
    if (!c) { setErr("Enter a room code"); return; }
    setLoading(true);
    setErr(null);
    const res = await fetch("/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: c }),
    });
    setLoading(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error ?? "Join failed"); return; }
    router.replace(`/room/${c}`);
  };

  return (
    <Protected>
      <div className="max-w-md mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Join a Room</h1>
        <form onSubmit={submit} className="space-y-3">
          <input
            className="w-full rounded border p-2 uppercase tracking-widest"
            placeholder="ROOM CODE"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
          />
          <button
            className="rounded bg-black text-white px-4 py-2"
            disabled={loading}
          >
            {loading ? "Joining…" : "Join room"}
          </button>
          {err && <p className="text-red-500 text-sm">{err}</p>}
        </form>
      </div>
    </Protected>
  );
}