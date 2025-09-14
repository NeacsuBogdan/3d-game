import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RoomRow = { id: string; host_uid: string | null };
type LeaveBody = { roomId: string };

function parseLeaveBody(body: unknown): LeaveBody | null {
  if (typeof body !== "object" || body === null) return null;
  const v = (body as { roomId?: unknown }).roomId;
  return typeof v === "string" && v.length > 0 ? { roomId: v } : null;
}

export async function POST(req: Request) {
  // 1) Auth
  const supabase = await getServerSupabase();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2) Body tipat: roomId este OBLIGATORIU
  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    // no body
  }
  const parsed = parseLeaveBody(raw);
  if (!parsed) return NextResponse.json({ error: "Missing roomId" }, { status: 400 });
  const { roomId } = parsed;

  const admin = getAdminClient();

  // 3) Ești membru? (protejează împotriva ștergerilor “goale”)
  const { data: membership } = await admin
    .from("room_members")
    .select("room_id, uid, seat_index")
    .eq("room_id", roomId)
    .eq("uid", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ ok: true, removed: 0 }); // nimic de șters
  }

  // 4) Citește camera (pt reasignare host)
  const { data: roomRow, error: roomErr } = await admin
    .from("rooms")
    .select("id, host_uid")
    .eq("id", roomId)
    .maybeSingle();

  if (roomErr) return NextResponse.json({ error: roomErr.message }, { status: 400 });
  const room: RoomRow | null = roomRow ? (roomRow as RoomRow) : null;

  // 5) Șterge FIX un rând (count verificat)
  const { error: delErr, count } = await admin
    .from("room_members")
    .delete({ count: "exact" })
    .eq("room_id", roomId)
    .eq("uid", user.id);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });
  if ((count ?? 0) !== 1) {
    // ceva e off; nu continuăm cu reasignarea host-ului
    return NextResponse.json({ error: "Leave failed: unexpected rowcount" }, { status: 409 });
  }

  // 6) Dacă user-ul era host → reasignează celui mai mic seat_index (dacă mai există cineva)
  if (room?.host_uid === user.id) {
    const { data: nextHost } = await admin
      .from("room_members")
      .select("uid, seat_index")
      .eq("room_id", roomId)
      .order("seat_index", { ascending: true })
      .limit(1)
      .maybeSingle();

    const nextHostUid =
      nextHost && typeof (nextHost as { uid?: unknown }).uid === "string"
        ? (nextHost as { uid: string }).uid
        : null;

    if (nextHostUid) {
      await admin.from("rooms").update({ host_uid: nextHostUid }).eq("id", roomId);
    } else {
      await admin.from("rooms").update({ host_uid: null }).eq("id", roomId);
      // opțional: status='ended'
      // await admin.from("rooms").update({ status: "ended", host_uid: null }).eq("id", roomId);
    }
  }

  return NextResponse.json({ ok: true, removed: 1 });
}
