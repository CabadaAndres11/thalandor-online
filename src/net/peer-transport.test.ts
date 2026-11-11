import { JOIN_TIMEOUT_MS, TransportError, type Connection } from './transport';

type Handler = (...args: unknown[]) => void;

class Emitter {
  private handlers = new Map<string, Handler[]>();
  on(evt: string, cb: Handler) {
    this.handlers.set(evt, [...(this.handlers.get(evt) ?? []), cb]);
    return this;
  }
  emit(evt: string, ...args: unknown[]) {
    for (const cb of this.handlers.get(evt) ?? []) cb(...args);
  }
}

class FakeConn extends Emitter {
  open = false;
  closed = false;
  sent: unknown[] = [];
  constructor(
    readonly peer: string,
    readonly label: string,
    readonly reliable: boolean,
  ) {
    super();
  }
  send(d: unknown) {
    this.sent.push(d);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this.emit('close');
  }
  doOpen() {
    this.open = true;
    this.emit('open');
  }
}

class FakePeer extends Emitter {
  static instances: FakePeer[] = [];
  destroyed = false;
  conns: FakeConn[] = [];
  constructor(
    readonly id?: string,
    readonly options?: unknown,
  ) {
    super();
    FakePeer.instances.push(this);
  }
  connect(peerId: string, opts: { label: string; reliable: boolean }) {
    const c = new FakeConn(peerId, opts.label, opts.reliable);
    this.conns.push(c);
    return c;
  }
  destroy() {
    this.destroyed = true;
  }
  reconnect() {}
}

vi.mock('peerjs', () => ({ Peer: FakePeer, default: FakePeer }));

const { createPeerClient, createPeerHost } = await import('./peer-transport');

beforeEach(() => {
  FakePeer.instances = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const peerError = (type: string) => Object.assign(new Error(type), { type });

test('maps peer-unavailable to room-not-found', async () => {
  const p = createPeerClient().connect('ABC234');
  const peer = FakePeer.instances[0]!;
  peer.emit('open', 'me');
  expect(peer.conns.map((c) => [c.peer, c.label, c.reliable])).toEqual([
    ['thalandor-ABC234', 'rel', true],
    ['thalandor-ABC234', 'unrel', false],
  ]);
  peer.emit('error', peerError('peer-unavailable'));
  await expect(p).rejects.toMatchObject({ kind: 'room-not-found' });
  await expect(p).rejects.toBeInstanceOf(TransportError);
  expect(peer.destroyed).toBe(true);
});

test('rejects with timeout after JOIN_TIMEOUT_MS', async () => {
  const p = createPeerClient().connect('ABC234');
  const assertion = expect(p).rejects.toMatchObject({ kind: 'timeout' });
  FakePeer.instances[0]!.emit('open', 'me');
  await vi.advanceTimersByTimeAsync(JOIN_TIMEOUT_MS + 1);
  await assertion;
  expect(FakePeer.instances[0]!.destroyed).toBe(true);
});

test('client resolves when both channels open and routes by channel', async () => {
  const p = createPeerClient().connect('ABC234');
  const peer = FakePeer.instances[0]!;
  peer.emit('open', 'me');
  const [rel, unrel] = peer.conns as [FakeConn, FakeConn];
  rel.doOpen();
  unrel.doOpen();
  const conn = await p;
  conn.send('r', 'reliable');
  conn.send('u', 'unreliable');
  expect(rel.sent).toEqual(['r']);
  expect(unrel.sent).toEqual(['u']);
  const got: string[] = [];
  conn.onMessage((d) => got.push(d));
  unrel.emit('data', 'snap');
  expect(got).toEqual(['snap']);
  let closed = 0;
  conn.onClose(() => closed++);
  rel.close();
  expect(closed).toBe(1);
  expect(unrel.closed).toBe(true);
});

test('pairs rel and unrel connections into one Connection on host', async () => {
  const hp = createPeerHost();
  FakePeer.instances[0]!.emit('open', FakePeer.instances[0]!.id);
  const host = await hp;
  const accepted: Connection[] = [];
  host.onConnection((c) => accepted.push(c));
  const rel = new FakeConn('guest-1', 'rel', true);
  const unrel = new FakeConn('guest-1', 'unrel', false);
  FakePeer.instances[0]!.emit('connection', rel);
  FakePeer.instances[0]!.emit('connection', unrel);
  rel.doOpen();
  expect(accepted).toHaveLength(0);
  unrel.doOpen();
  expect(accepted).toHaveLength(1);
  accepted[0]!.send('x', 'unreliable');
  expect(unrel.sent).toEqual(['x']);
  const got: string[] = [];
  accepted[0]!.onMessage((d) => got.push(d));
  rel.emit('data', 'hello');
  expect(got).toEqual(['hello']);
});

test('retries with a new code on unavailable-id', async () => {
  const hp = createPeerHost();
  FakePeer.instances[0]!.emit('error', peerError('unavailable-id'));
  expect(FakePeer.instances[0]!.destroyed).toBe(true);
  const second = FakePeer.instances[1]!;
  second.emit('open', second.id);
  const host = await hp;
  expect(host.code).toHaveLength(6);
  expect(second.id).toBe(`thalandor-${host.code}`);
});

test('gives up after 3 unavailable-id attempts', async () => {
  const hp = createPeerHost();
  const assertion = expect(hp).rejects.toMatchObject({ kind: 'network' });
  for (let i = 0; i < 3; i++) FakePeer.instances[i]!.emit('error', peerError('unavailable-id'));
  await assertion;
  expect(FakePeer.instances).toHaveLength(3);
});
