import type { TiledMap } from '../sim/collision-map';
import type { Channel, Connection, HostTransport } from '../net/transport';
import type { MainToWorker, WorkerToMain } from './worker-protocol';

export interface WorkerLike {
  postMessage(m: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  terminate(): void;
}

export interface WorkerHostOptions {
  version: string;
  mapId: string;
  mapJson: TiledMap;
  defaultName: string;
  workerFactory?: () => WorkerLike;
}

export interface WorkerHostHandle {
  /** Connection for the host's own player. */
  connectLocal(): Connection;
  /** Relays every connection accepted by this transport to the worker. */
  addTransport(t: HostTransport): void;
  /** Pause menu of the host player: the world stops only while nobody else is in the game. */
  setPaused(paused: boolean): void;
  stop(): void;
}

const LOCAL_ID = 'local';

function defaultWorker(): WorkerLike {
  return new Worker(new URL('./host.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
}

/** Main-thread side of the host: owns network connections and forwards them to the simulation worker. */
export function startWorkerHost(opts: WorkerHostOptions): WorkerHostHandle {
  const worker = (opts.workerFactory ?? defaultWorker)();
  const post = (m: MainToWorker) => worker.postMessage(m);
  /** Main-thread endpoints keyed by connId: where worker 'send'/'kick' messages go. */
  const endpoints = new Map<string, { send(data: string, ch: Channel): void; close(): void }>();
  const transports: HostTransport[] = [];
  let nextRemote = 1;
  let stopped = false;

  worker.onmessage = (e) => {
    const m = e.data as WorkerToMain;
    const ep = endpoints.get(m.connId);
    if (!ep) return;
    if (m.k === 'send') ep.send(m.data, m.channel);
    else {
      endpoints.delete(m.connId);
      ep.close();
    }
  };

  post({ k: 'init', version: opts.version, mapId: opts.mapId, mapJson: opts.mapJson, defaultName: opts.defaultName });

  return {
    connectLocal(): Connection {
      const msgCbs: ((d: string) => void)[] = [];
      const closeCbs: (() => void)[] = [];
      let closed = false;
      const markClosed = () => {
        if (closed) return;
        closed = true;
        closeCbs.forEach((cb) => cb());
      };
      endpoints.set(LOCAL_ID, { send: (d) => !closed && msgCbs.forEach((cb) => cb(d)), close: markClosed });
      post({ k: 'open', connId: LOCAL_ID, local: true });
      return {
        id: LOCAL_ID,
        send: (data) => {
          if (!closed) post({ k: 'msg', connId: LOCAL_ID, data });
        },
        onMessage: (cb) => msgCbs.push(cb),
        onClose: (cb) => closeCbs.push(cb),
        close: () => {
          if (closed) return;
          closed = true;
          endpoints.delete(LOCAL_ID);
          post({ k: 'close', connId: LOCAL_ID });
        },
      };
    },

    addTransport(t: HostTransport): void {
      transports.push(t);
      t.onConnection((c) => {
        if (stopped) return c.close();
        const connId = `r${nextRemote++}`;
        endpoints.set(connId, { send: (d, ch) => c.send(d, ch), close: () => c.close() });
        post({ k: 'open', connId });
        c.onMessage((data) => post({ k: 'msg', connId, data }));
        c.onClose(() => {
          if (endpoints.delete(connId)) post({ k: 'close', connId });
        });
      });
    },

    setPaused(paused: boolean): void {
      if (!stopped) post({ k: 'pause', paused });
    },

    stop(): void {
      if (stopped) return;
      stopped = true;
      for (const [id, ep] of [...endpoints]) {
        endpoints.delete(id);
        ep.close();
      }
      transports.forEach((t) => t.close());
      worker.terminate();
    },
  };
}
