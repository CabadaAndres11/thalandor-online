import { Peer, type DataConnection, type PeerOptions } from 'peerjs';
import { getIceServers } from './ice-config';
import { generateRoomCode, peerIdFor } from './room-code';
import { JOIN_TIMEOUT_MS, TransportError, type Channel, type ClientTransport, type Connection, type HostTransport } from './transport';

export interface PeerOpts {
  host?: string;
  port?: number;
  path?: string;
  secure?: boolean;
}

const REL = 'rel';
const UNREL = 'unrel';
const MAX_ID_ATTEMPTS = 3;

/** Signaling server settings: env vars point at a local server for E2E; default is the free public PeerJS cloud. */
function peerOptions(opts: PeerOpts = {}): Partial<PeerOptions> {
  const env = import.meta.env;
  const host = opts.host ?? env.VITE_PEER_HOST;
  const port = opts.port ?? (env.VITE_PEER_PORT ? Number(env.VITE_PEER_PORT) : undefined);
  const path = opts.path ?? env.VITE_PEER_PATH;
  const o: Partial<PeerOptions> = { config: { iceServers: getIceServers() } };
  if (host) {
    o.host = host;
    o.secure = opts.secure ?? !(host === 'localhost' || host === '127.0.0.1');
  }
  if (port) o.port = port;
  if (path) o.path = path;
  return o;
}

const errType = (e: unknown) => (e as { type?: string } | null)?.type;

/** Joins a reliable and an unreliable DataConnection into one Connection. */
function pairConnection(id: string, rel: DataConnection, unrel: DataConnection, onClosed?: () => void): Connection {
  const msgCbs: ((d: string) => void)[] = [];
  const closeCbs: (() => void)[] = [];
  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    rel.close();
    unrel.close();
    onClosed?.();
    closeCbs.forEach((cb) => cb());
  };
  for (const dc of [rel, unrel]) {
    dc.on('data', (d) => {
      if (!closed && typeof d === 'string') msgCbs.forEach((cb) => cb(d));
    });
    dc.on('close', finish);
  }
  return {
    id,
    send(data: string, channel: Channel) {
      if (closed) return;
      const dc = channel === 'reliable' ? rel : unrel;
      if (dc.open) void dc.send(data);
    },
    onMessage: (cb) => msgCbs.push(cb),
    onClose: (cb) => closeCbs.push(cb),
    close() {
      if (closed) return;
      closed = true;
      // Flush so a final message (e.g. a reject reason) still reaches the peer.
      rel.close({ flush: true });
      unrel.close();
      onClosed?.();
    },
  };
}

export function createPeerHost(opts?: PeerOpts): Promise<HostTransport> {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryOpen = () => {
      attempt++;
      const code = generateRoomCode();
      const peer = new Peer(peerIdFor(code), peerOptions(opts));
      let opened = false;
      const cbs: ((c: Connection) => void)[] = [];
      const pending = new Map<string, { rel?: DataConnection; unrel?: DataConnection }>();

      peer.on('open', () => {
        opened = true;
        resolve({ code, onConnection: (cb) => cbs.push(cb), close: () => peer.destroy() });
      });
      peer.on('error', (e) => {
        if (opened) return;
        peer.destroy();
        if (errType(e) === 'unavailable-id' && attempt < MAX_ID_ATTEMPTS) tryOpen();
        else reject(new TransportError('network', String((e as Error)?.message ?? e)));
      });
      // Lost the signaling server: keep existing games, try to get back so new friends can join.
      peer.on('disconnected', () => {
        if (opened && !peer.destroyed) peer.reconnect();
      });
      peer.on('connection', (dc) => {
        const slot = pending.get(dc.peer) ?? {};
        if (dc.label === REL) slot.rel = dc;
        else if (dc.label === UNREL) slot.unrel = dc;
        else return dc.close();
        pending.set(dc.peer, slot);
        const tryPair = () => {
          const s = pending.get(dc.peer);
          if (!s?.rel?.open || !s.unrel?.open) return;
          pending.delete(dc.peer);
          const conn = pairConnection(dc.peer, s.rel, s.unrel);
          cbs.forEach((cb) => cb(conn));
        };
        dc.on('open', tryPair);
        dc.on('close', () => {
          const s = pending.get(dc.peer);
          if (s && (s.rel === dc || s.unrel === dc)) {
            pending.delete(dc.peer);
            s.rel?.close();
            s.unrel?.close();
          }
        });
        setTimeout(() => {
          const s = pending.get(dc.peer);
          if (s) {
            pending.delete(dc.peer);
            s.rel?.close();
            s.unrel?.close();
          }
        }, JOIN_TIMEOUT_MS);
        tryPair();
      });
    };
    tryOpen();
  });
}

export function createPeerClient(opts?: PeerOpts): ClientTransport {
  return {
    connect: (code) =>
      new Promise<Connection>((resolve, reject) => {
        const peer = new Peer(peerOptions(opts));
        let settled = false;
        const fail = (kind: 'room-not-found' | 'timeout' | 'network', msg?: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          peer.destroy();
          reject(new TransportError(kind, msg));
        };
        const timer = setTimeout(() => fail('timeout'), JOIN_TIMEOUT_MS);
        peer.on('error', (e) => fail(errType(e) === 'peer-unavailable' ? 'room-not-found' : 'network', String((e as Error)?.message ?? e)));
        peer.on('open', () => {
          const target = peerIdFor(code);
          const rel = peer.connect(target, { label: REL, reliable: true, serialization: 'raw' });
          const unrel = peer.connect(target, { label: UNREL, reliable: false, serialization: 'raw' });
          const maybeDone = () => {
            if (settled || !rel.open || !unrel.open) return;
            settled = true;
            clearTimeout(timer);
            resolve(pairConnection(target, rel, unrel, () => peer.destroy()));
          };
          rel.on('open', maybeDone);
          unrel.on('open', maybeDone);
        });
      }),
  };
}
