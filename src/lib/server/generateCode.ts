const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I / O

export function generateRoomCode(len = 5): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}
