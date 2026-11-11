import type { CollisionMap } from '../sim/collision-map';
import { stepPlayerMovement } from '../sim/movement';
import type { PlayerInput, Vec2 } from '../sim/types';

/** Client-side prediction for the local player, reconciled against host snapshots. */
export class Predictor {
  private current: Vec2 = { x: 0, y: 0 };
  private pending: PlayerInput[] = [];

  constructor(private readonly map: CollisionMap) {}

  get pos(): Vec2 {
    return this.current;
  }

  applyLocal(input: PlayerInput): void {
    this.pending.push(input);
    this.current = stepPlayerMovement(this.current, input, this.map);
  }

  reconcile(serverPos: Vec2, lastAckSeq: number): void {
    this.pending = this.pending.filter((i) => i.seq > lastAckSeq);
    let pos: Vec2 = { x: serverPos.x, y: serverPos.y };
    for (const i of this.pending) pos = stepPlayerMovement(pos, i, this.map);
    this.current = pos;
  }
}
