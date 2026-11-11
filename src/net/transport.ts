export type Channel = 'reliable' | 'unreliable';

/** A bidirectional link between the host and one client. */
export interface Connection {
  readonly id: string;
  send(data: string, channel: Channel): void;
  onMessage(cb: (data: string) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}

export interface HostTransport {
  readonly code: string;
  onConnection(cb: (c: Connection) => void): void;
  close(): void;
}

export interface ClientTransport {
  connect(code: string): Promise<Connection>;
}

export type TransportErrorKind = 'room-not-found' | 'timeout' | 'network';

export class TransportError extends Error {
  constructor(
    readonly kind: TransportErrorKind,
    message?: string,
  ) {
    super(message ?? kind);
    this.name = 'TransportError';
  }
}

export const JOIN_TIMEOUT_MS = 10_000;
