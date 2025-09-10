import type { SwapDecline, SwapRequest, SwapTakeDone, SwapVacated } from "./types";

export const EVT_SWAP_REQUEST  = "swap_request"  as const;
export const EVT_SWAP_DECLINE  = "swap_decline"  as const;
export const EVT_SWAP_VACATED  = "swap_vacated"  as const;
export const EVT_SWAP_TAKE_DONE = "swap_take_done" as const;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

export const isSwapRequest = (p: unknown): p is SwapRequest =>
  isObject(p) &&
  p["type"] === EVT_SWAP_REQUEST &&
  typeof p["room_id"] === "string" &&
  typeof p["from_uid"] === "string" &&
  typeof p["to_uid"] === "string" &&
  typeof p["from_char"] === "string" &&
  typeof p["to_char"] === "string";

export const isSwapDecline = (p: unknown): p is SwapDecline =>
  isObject(p) &&
  p["type"] === EVT_SWAP_DECLINE &&
  typeof p["room_id"] === "string" &&
  typeof p["from_uid"] === "string" &&
  typeof p["to_uid"] === "string";

export const isSwapVacated = (p: unknown): p is SwapVacated =>
  isObject(p) &&
  p["type"] === EVT_SWAP_VACATED &&
  typeof p["room_id"] === "string" &&
  typeof p["vacated_uid"] === "string" &&
  typeof p["to_uid"] === "string" &&
  typeof p["vacated_char"] === "string" &&
  typeof p["other_char"] === "string";

export const isSwapTakeDone = (p: unknown): p is SwapTakeDone =>
  isObject(p) &&
  p["type"] === EVT_SWAP_TAKE_DONE &&
  typeof p["room_id"] === "string" &&
  typeof p["from_uid"] === "string" &&
  typeof p["to_uid"] === "string" &&
  typeof p["initiator_old_char"] === "string";
