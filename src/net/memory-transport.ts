import { TransportError, type Channel, type ClientTransport, type Connection, type HostTransport } from './transport';

export interface MemoryNetworkOptions {
  latencyMs?: number;
  /** Probability (0..1) of dropping each unreliable message. */
  lossRate?: number;
  rng?: () => number;
}

class MemoryConnection implements Connection {
  peer!: MemoryConnection;
  closed = false;
  private readonly msgCbs: ((d: string) => void)[] = [];
  private readonly closeCbs: (() => void)[] = [];

  constructor(
    readonly id: string,
    private readonly opts: Required<MemoryNetworkOptions>,
  ) {}

  send(data: string, channel: Channel): void {
    if (this.closed) return;
    if (channel === 'unreliable' && this.opts.lossRate > 0 && this.opts.rng() < this.opts.lossRate) return;
    const target = this.peer;
    setTimeout(() => target.deliver(data), this.opts.latencyMs);
  }

  onMessage(cb: (data: string) => void): void {
    this.msgCbs.push(cb);
  }

  onClose(cb: () => void): void {
    this.closeCbs.push(cb);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const target = this.peer;
    setTimeout(() => target.remoteClosed(), this.opts.latencyMs);
  }

  private deliver(data: string): void {
    if (this.closed) return;
    for (const cb of this.msgCbs) cb(data);
  }

  private remoteClosed(): void {
    if (this.closed) return;
    this.closed = true;
    for (const cb of this.closeCbs) cb();
  }
}

/** In-memory network with simulated latency and loss, for tests and local play. */
export function createMemoryNetwork(options: MemoryNetworkOptions = {}) {
  const opts: Required<MemoryNetworkOptions> = {
    latencyMs: options.latencyMs ?? 0,
    lossRate: options.lossRate ?? 0,
    rng: options.rng ?? Math.random,
  };
  const hosts = new Map<string, { accept: (c: Connection) => void; conns: Set<MemoryConnection> }>();
  let nextId = 1;

  function createHost(code: string): HostTransport {
    const cbs: ((c: Connection) => void)[] = [];
    const conns = new Set<MemoryConnection>();
    hosts.set(code, { accept: (c) => cbs.forEach((cb) => cb(c)), conns });
    return {
      code,
      onConnection: (cb) => cbs.push(cb),
      close: () => {
        hosts.delete(code);
        for (const c of conns) c.close();
      },
    };
  }

  function createClient(): ClientTransport {
    return {
      connect: (code) =>
        new Promise<Connection>((resolve, reject) => {
          setTimeout(() => {
            const host = hosts.get(code);
            if (!host) return reject(new TransportError('room-not-found'));
            const id = `mem-${nextId++}`;
            const clientSide = new MemoryConnection(id, opts);
            const hostSide = new MemoryConnection(id, opts);
            clientSide.peer = hostSide;
            hostSide.peer = clientSide;
            host.conns.add(hostSide);
            host.accept(hostSide);
            resolve(clientSide);
          }, opts.latencyMs);
        }),
    };
  }

  return { createHost, createClient };
}
