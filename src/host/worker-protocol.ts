import type { TiledMap } from '../sim/collision-map';
import type { Channel } from '../net/transport';

/** Messages from the main thread to the host worker. */
export type MainToWorker =
  | { k: 'init'; version: string; mapId: string; mapJson: TiledMap; defaultName: string }
  | { k: 'open'; connId: string }
  | { k: 'msg'; connId: string; data: string }
  | { k: 'close'; connId: string }
  | { k: 'stop' };

/** Messages from the host worker to the main thread. */
export type WorkerToMain = { k: 'send'; connId: string; data: string; channel: Channel } | { k: 'kick'; connId: string };
