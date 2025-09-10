import { supabase } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { RoomMemberRow, Member } from "./types";

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

export const pgErrHasCode = (e: unknown): e is { code: string; message: string } =>
  isObject(e) && typeof (e as { code?: unknown }).code === "string" && typeof (e as { message?: unknown }).message === "string";

export const isRoomMemberRow = (v: unknown): v is RoomMemberRow =>
  isObject(v) &&
  "uid" in v &&
  "room_id" in v &&
  "seat_index" in v &&
  "display_name" in v &&
  "is_ready" in v;

export const toMember = (r: RoomMemberRow): Member => ({
  uid: r.uid,
  seat_index: r.seat_index,
  display_name: r.display_name,
  character_id: r.character_id,
  is_ready: r.is_ready,
});

export const makeEventsChannel = (roomId: string, selfEcho = true): RealtimeChannel =>
  supabase.channel(`room:${roomId}:events`, { config: { broadcast: { self: selfEcho } } });

export const makeMembersChannel = (roomId: string): RealtimeChannel =>
  supabase.channel(`room:${roomId}:members`);

export const makePresenceChannel = (roomId: string, key: string): RealtimeChannel =>
  supabase.channel(`room:${roomId}:presence`, { config: { presence: { key } } });
