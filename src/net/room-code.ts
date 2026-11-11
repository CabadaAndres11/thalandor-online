/** No 0/O, 1/I to avoid confusion when friends read the code aloud. */
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_ALPHABET[Math.min(ROOM_ALPHABET.length - 1, Math.floor(rng() * ROOM_ALPHABET.length))];
  }
  return code;
}

export function normalizeRoomCode(input: string): string | null {
  const code = input.replace(/\s+/g, '').toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const c of code) if (!ROOM_ALPHABET.includes(c)) return null;
  return code;
}

export function peerIdFor(code: string): string {
  return `thalandor-${code}`;
}
