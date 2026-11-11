import { generateRoomCode, normalizeRoomCode, peerIdFor, ROOM_ALPHABET } from './room-code';

test('generates 6 chars from alphabet', () => {
  for (let i = 0; i < 50; i++) {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
    for (const c of code) expect(ROOM_ALPHABET).toContain(c);
  }
  expect(generateRoomCode(() => 0)).toBe('AAAAAA');
  expect(generateRoomCode(() => 0.999999)).toBe('999999');
});

test("normalize accepts ' abc234 ' as 'ABC234'", () => {
  expect(normalizeRoomCode(' abc234 ')).toBe('ABC234');
});

test("normalize rejects 'ABC10' and codes with ambiguous chars", () => {
  expect(normalizeRoomCode('ABC10')).toBeNull();
  expect(normalizeRoomCode('ABC10Z')).toBeNull();
  expect(normalizeRoomCode('ABCDEFG')).toBeNull();
});

test('peerIdFor prefixes the code', () => {
  expect(peerIdFor('ABC234')).toBe('thalandor-ABC234');
});
