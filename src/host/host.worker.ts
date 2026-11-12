/// <reference lib="webworker" />
import { CollisionMap, type TiledMap } from '../sim/collision-map';
import { World } from '../sim/world';
import { spawnsFromTiled } from '../sim/map-objects';
import type { Channel, Connection } from '../net/transport';
import { HostSession } from './host-session';
import { startTickLoop } from './tick-loop';
import type { MainToWorker, WorkerToMain } from './worker-protocol';

interface VirtualConn extends Connection {
  deliver(data: string): void;
  remoteClosed(): void;
}

function spawnOf(json: TiledMap): { x: number; y: number } {
  const prop = (name: string) => json.properties?.find((p) => p.name === name)?.value;
  const x = prop('spawnX');
  const y = prop('spawnY');
  return {
    x: typeof x === 'number' ? x : (json.width * json.tilewidth) / 2,
    y: typeof y === 'number' ? y : (json.height * json.tileheight) / 2,
  };
}

/**
 * Host logic that runs inside the worker. Exported as a factory so tests can run it
 * in-process; the bottom of this file wires it to the real worker scope.
 */
export function createWorkerHandler(post: (m: WorkerToMain) => void, opts: { now?: () => number } = {}) {
  let session: HostSession | null = null;
  let stopLoop: (() => void) | null = null;
  const conns = new Map<string, VirtualConn>();

  function virtualConn(id: string): VirtualConn {
    const msgCbs: ((d: string) => void)[] = [];
    const closeCbs: (() => void)[] = [];
    let closed = false;
    return {
      id,
      send: (data: string, channel: Channel) => {
        if (!closed) post({ k: 'send', connId: id, data, channel });
      },
      onMessage: (cb) => msgCbs.push(cb),
      onClose: (cb) => closeCbs.push(cb),
      close: () => {
        if (closed) return;
        closed = true;
        conns.delete(id);
        post({ k: 'kick', connId: id });
      },
      deliver: (data) => {
        if (!closed) msgCbs.forEach((cb) => cb(data));
      },
      remoteClosed: () => {
        if (closed) return;
        closed = true;
        conns.delete(id);
        closeCbs.forEach((cb) => cb());
      },
    };
  }

  return (m: MainToWorker): void => {
    switch (m.k) {
      case 'init': {
        const world = new World(CollisionMap.fromTiled(m.mapJson), spawnOf(m.mapJson), { spawns: spawnsFromTiled(m.mapJson) });
        session = new HostSession(world, { version: m.version, mapId: m.mapId, defaultName: m.defaultName, now: opts.now, devCommands: import.meta.env.DEV });
        const s = session;
        stopLoop = startTickLoop(() => s.tick(), { now: opts.now });
        break;
      }
      case 'open': {
        const c = virtualConn(m.connId);
        conns.set(m.connId, c);
        session?.attach(c, { noTimeout: m.local === true });
        break;
      }
      case 'msg':
        conns.get(m.connId)?.deliver(m.data);
        break;
      case 'close':
        conns.get(m.connId)?.remoteClosed();
        break;
      case 'stop':
        stopLoop?.();
        stopLoop = null;
        break;
    }
  };
}

declare const self: DedicatedWorkerGlobalScope | undefined;
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
  const scope = self;
  const handle = createWorkerHandler((m) => scope.postMessage(m));
  scope.onmessage = (e: MessageEvent<MainToWorker>) => handle(e.data);
}
