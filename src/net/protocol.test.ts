import { decodeClient, decodeHost, encode, type ClientMessage, type HostMessage } from './protocol';

const clientMsgs: ClientMessage[] = [
  { t: 'hello', version: '0.1.0', name: 'Ana' },
  { t: 'input', input: { seq: 3, moveX: 1, moveY: -1, aimX: 10, aimY: 20 } },
  { t: 'chat', text: 'hola' },
];
const hostMsgs: HostMessage[] = [
  { t: 'welcome', playerId: 1, mapId: 'test-arena' },
  { t: 'reject', reason: 'version' },
  { t: 'snapshot', s: { tick: 5, players: [{ id: 1, name: 'Ana', x: 1, y: 2, lastInputSeq: 3 }] } },
  { t: 'chat', from: 'Ana', text: 'hola' },
  { t: 'left', playerId: 1, name: 'Ana' },
];

test('round-trips every message type', () => {
  for (const m of clientMsgs) expect(decodeClient(encode(m))).toEqual(m);
  for (const m of hostMsgs) expect(decodeHost(encode(m))).toEqual(m);
});

test('decode returns null for garbage, unknown t, non-object', () => {
  for (const raw of ['{nope', '{"t":"boom"}', '42', 'null', '"hello"', '[]']) {
    expect(decodeClient(raw)).toBeNull();
    expect(decodeHost(raw)).toBeNull();
  }
  expect(decodeClient(encode({ t: 'welcome', playerId: 1, mapId: 'x' }))).toBeNull();
  expect(decodeHost(encode({ t: 'hello', version: '1', name: 'a' }))).toBeNull();
});
