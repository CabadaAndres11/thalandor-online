import { netChar } from '../test-fixtures';
import { decodeClient, decodeHost, encode, type ClientMessage, type HostMessage } from './protocol';

const UNIT = { id: 1, kind: 'player' as const, type: 'mage', name: 'Ana', x: 1, y: 2, facing: 1, moving: true, hp: 50, maxHp: 90, state: 'alive' as const, lastInputSeq: 3 };
const ME = { resource: 10, maxResource: 100, resourceKind: 'mana', cd: { lmb: 0, s1: 500 }, gcd: 0, shield: 0, downedMs: 0, respawnMs: 0, moveSpeed: 120, canMove: true, lastPressSeq: 3, statuses: [], reviving: null, dash: null, combo: 0, channel: null };

const clientMsgs: ClientMessage[] = [
  { t: 'hello', version: '0.1.0', character: netChar('Ana', 'mage', { mapId: 'test-arena', x: 1, y: 2 }) },
  { t: 'input', input: { seq: 3, moveX: 1, moveY: -1, aimX: 10, aimY: 20 } },
  { t: 'input', input: { seq: 4, moveX: 0, moveY: 0, aimX: 1, aimY: 2, buttons: 1, presses: [{ seq: 9, slot: 's2', aimX: 5, aimY: 6 }] } },
  { t: 'chat', text: 'hola' },
];
const hostMsgs: HostMessage[] = [
  { t: 'welcome', playerId: 1, mapId: 'test-arena' },
  { t: 'reject', reason: 'version' },
  { t: 'snapshot', s: { tick: 5, units: [UNIT, { ...UNIT, id: 2, kind: 'monster', type: 'bat', action: { anim: 'slash', ms: 100 } }] } },
  { t: 'snapshot', s: { tick: 6, units: [UNIT] }, me: ME },
  { t: 'events', list: [{ e: 'hit', src: 2, dst: 1, amount: 5, crit: false, dodged: false, heal: false, absorbed: 0, school: 'physical' }, { e: 'died', id: 2 }] },
  { t: 'chat', from: 'Ana', text: 'hola' },
  { t: 'left', playerId: 1, name: 'Ana' },
  { t: 'roster', players: [{ id: 1, name: 'Ana', classId: 'cleric', appearance: netChar('Ana').appearance }] },
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
  expect(decodeHost(encode({ t: 'hello', version: '1', character: netChar('a') }))).toBeNull();
});

test('decode rejects hello without a well-formed character', () => {
  expect(decodeClient('{"t":"hello","version":"1","name":"a"}')).toBeNull();
  const c = netChar('Ana');
  for (const bad of [
    { ...c, name: 3 },
    { ...c, appearance: null },
    { ...c, appearance: { body: 'male' } },
    { ...c, lastLocation: { x: 1, y: 2 } },
    { ...c, classId: 7 },
  ]) {
    expect(decodeClient(JSON.stringify({ t: 'hello', version: '1', character: bad }))).toBeNull();
  }
});

test('decode rejects snapshots without facing/moving and malformed rosters', () => {
  expect(decodeHost('{"t":"snapshot","s":{"tick":1,"players":[{"id":1,"name":"a","x":1,"y":2,"lastInputSeq":0}]}}')).toBeNull();
  expect(decodeHost('{"t":"roster","players":[{"id":1,"name":"a"}]}')).toBeNull();
});

test('decode rejects malformed presses, units and events', () => {
  const bad = (input: object) => decodeClient(JSON.stringify({ t: 'input', input: { seq: 1, moveX: 0, moveY: 0, aimX: 0, aimY: 0, ...input } }));
  expect(bad({ presses: [{ seq: 1, slot: 'nuke', aimX: 0, aimY: 0 }] })).toBeNull();
  expect(bad({ presses: 'x' })).toBeNull();
  expect(bad({ buttons: 'x' })).toBeNull();
  expect(decodeHost(JSON.stringify({ t: 'snapshot', s: { tick: 1, units: [{ ...UNIT, state: 'zombie' }] } }))).toBeNull();
  expect(decodeHost(JSON.stringify({ t: 'snapshot', s: { tick: 1, units: [{ ...UNIT, facing: 7 }] } }))).toBeNull();
  expect(decodeHost(JSON.stringify({ t: 'events', list: [{ nope: 1 }] }))).toBeNull();
});

test('progress requests: valid shapes pass, unknown kinds and bad fields are dropped', () => {
  const ok: ClientMessage[] = [
    { t: 'progress-req', req: { k: 'attr', attr: 'stamina' } },
    { t: 'progress-req', req: { k: 'talent', node: 'might_1a' } },
    { t: 'progress-req', req: { k: 'spec', specId: 'mage_fire' } },
    { t: 'progress-req', req: { k: 'resetTalents' } },
    { t: 'progress-req', req: { k: 'hotbar', slot: 2, abilityId: null } },
  ];
  for (const m of ok) expect(decodeClient(encode(m))).toEqual(m);
  for (const req of [{ k: 'attr', attr: 'luck' }, { k: 'gold' }, { k: 'hotbar', slot: 'x', abilityId: null }, null]) {
    expect(decodeClient(JSON.stringify({ t: 'progress-req', req }))).toBeNull();
  }
  expect(decodeHost(JSON.stringify({ t: 'progress-refused', reason: 'combat' }))).toEqual({ t: 'progress-refused', reason: 'combat' });
  expect(decodeHost(JSON.stringify({ t: 'progress', p: { level: 1 } }))).toBeNull();
});
