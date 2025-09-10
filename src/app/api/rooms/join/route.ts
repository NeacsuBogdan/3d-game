import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type PgError = { code: string; message: string };
const hasPgCode = (e: unknown): e is PgError =>
  typeof e === 'object' &&
  e !== null &&
  'code' in e &&
  typeof (e as Record<string, unknown>).code === 'string' &&
  'message' in e &&
  typeof (e as Record<string, unknown>).message === 'string';

function getCodeFromBody(body: unknown): string {
  if (typeof body !== 'object' || body === null) return '';
  const val = (body as Record<string, unknown>).code;
  if (typeof val !== 'string') return '';
  return val.toUpperCase().trim();
}

export async function POST(req: Request) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // ignore
  }
  const code = getCodeFromBody(body);
  if (!code) {
    return NextResponse.json({ error: 'Missing room code' }, { status: 400 });
  }

  const admin = getAdminClient();

  // 1) find room
  const { data: room, error: roomErr } = await admin
    .from('rooms')
    .select('id, status, code')
    .eq('code', code)
    .maybeSingle();

  if (roomErr) return NextResponse.json({ error: roomErr.message }, { status: 400 });
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (room.status !== 'lobby') {
    return NextResponse.json({ error: 'Room is not joinable' }, { status: 409 });
  }

  // 2) already a member? (idempotent)
  {
    const { data: existing, error } = await admin
      .from('room_members')
      .select('uid')
      .eq('room_id', room.id)
      .eq('uid', user.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (existing) {
      return NextResponse.json({ roomId: room.id, code: room.code });
    }
  }

  // 3) derive display name (profile.username -> email local-part)
  let displayName: string = user.email?.split('@')[0] ?? 'Player';
  {
    const { data: prof } = await admin
      .from('profiles')
      .select('username')
      .eq('uid', user.id)
      .maybeSingle();
    if (prof?.username) displayName = prof.username;
  }

  // 4) compute a free seat_index (smallest non-negative not used)
  let attempts = 0;
  while (attempts < 5) {
    attempts++;
    const { data: seats, error: seatsErr } = await admin
      .from('room_members')
      .select('seat_index')
      .eq('room_id', room.id)
      .order('seat_index', { ascending: true });
    if (seatsErr) return NextResponse.json({ error: seatsErr.message }, { status: 400 });

    let seat = 0;
    for (const s of seats ?? []) {
      if (s.seat_index === seat) seat++;
      else if (s.seat_index > seat) break;
    }

    const { error: insErr } = await admin.from('room_members').insert({
      room_id: room.id,
      uid: user.id,
      seat_index: seat,
      display_name: displayName,
      character_id: null,
      is_ready: false,
    });

    if (!insErr) {
      return NextResponse.json({ roomId: room.id, code: room.code });
    }
    if (hasPgCode(insErr) && insErr.code === '23505') {
      // race on seat_index, retry
      continue;
    }
    return NextResponse.json({ error: insErr.message }, { status: 400 });
  }

  return NextResponse.json({ error: 'Failed to allocate seat' }, { status: 500 });
}
