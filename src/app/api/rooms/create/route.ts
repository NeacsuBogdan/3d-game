import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { generateRoomCode } from "@/lib/server/generateCode";
import crypto from "node:crypto";

export const runtime = "nodejs";

type PgError = { code: string; message: string };
const hasPgCode = (e: unknown): e is PgError =>
  typeof e === "object" &&
  e !== null &&
  "code" in e &&
  typeof (e as Record<string, unknown>).code === "string" &&
  "message" in e &&
  typeof (e as Record<string, unknown>).message === "string";

export async function POST() {
  // 1) user autentic (validat la Auth server)
  const supabase = await getServerSupabase();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdminClient();

  // 2) display_name din profil (fallback: email local-part)
  let displayName: string = user.email?.split("@")[0] ?? "Player";
  {
    const { data: prof } = await admin
      .from("profiles")
      .select("username")
      .eq("uid", user.id)
      .maybeSingle();
    if (prof?.username) displayName = prof.username;
  }

  // 3) creează camera (retry pe conflict de code) — Service Role (bypass RLS)
  let roomId: string | null = null;
  let code = "";
  const seed = crypto.randomBytes(8).toString("hex");

  for (let attempt = 0; attempt < 5; attempt++) {
    code = generateRoomCode(5);
    const { data, error } = await admin
      .from("rooms")
      .insert({ code, seed, host_uid: user.id })
      .select("id")
      .single();

    if (!error && data) { roomId = data.id; break; }
    if (error) {
      if (hasPgCode(error) && error.code === "23505") continue;
      return NextResponse.json({ error: error.message ?? "Create failed" }, { status: 400 });
    }
  }

  if (!roomId) {
    return NextResponse.json({ error: "Failed to allocate room code" }, { status: 500 });
  }

  // 4) inserează host-ul ca membru (seat 0)
  const { error: memErr } = await admin.from("room_members").insert({
    room_id: roomId,
    uid: user.id,
    seat_index: 0,
    display_name: displayName,
    character_id: null,
    is_ready: false,
  });
  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 400 });
  }

  return NextResponse.json({ roomId, code });
}