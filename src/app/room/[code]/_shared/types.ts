export type Room = {
  id: string;
  code: string;
  status: "lobby" | "playing" | "ended";
  host_uid: string;
};

export type Member = {
  uid: string;
  seat_index: number;
  display_name: string;
  character_id: string | null;
  is_ready: boolean;
};

export type RoomMemberRow = Member & { room_id: string };

export type CharacterRow = {
  id: string;
  label: string;
  model_url: string | null;
  enabled: boolean;
};

export type StageMember = {
  uid: string;
  seat_index: number;
  display_name: string;
  character_id: string | null;
  is_ready: boolean;
};

// Swap events
export type SwapRequest = {
  type: "swap_request";
  room_id: string;
  from_uid: string;
  to_uid: string;
  from_char: string;
  to_char: string;
};

export type SwapDecline = {
  type: "swap_decline";
  room_id: string;
  from_uid: string;
  to_uid: string;
};

export type SwapVacated = {
  type: "swap_vacated";
  room_id: string;
  vacated_uid: string;
  to_uid: string;
  vacated_char: string;
  other_char: string;
};

export type SwapTakeDone = {
  type: "swap_take_done";
  room_id: string;
  from_uid: string;
  to_uid: string;
  initiator_old_char: string;
};
