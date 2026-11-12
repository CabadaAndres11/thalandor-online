import type { CollisionMap } from '../sim/collision-map';
import { PLAYER_RADIUS, PLAYER_SPEED } from '../sim/constants';
import { moveCircle, stepPlayerMovement } from '../sim/movement';
import { BALANCE } from '../sim/combat/defs';
import { DASH_TICKS } from '../sim/combat/unit';
import type { PlayerInput, Vec2 } from '../sim/types';

interface Pending {
  input: PlayerInput;
  /** Unit direction of a dodge started at this input. */
  dodge?: Vec2;
}

interface Dash {
  dx: number;
  dy: number;
  ticks: number;
}

/** Client-side prediction for the local player (movement and dodge), reconciled against host snapshots. */
export class Predictor {
  private current: Vec2 = { x: 0, y: 0 };
  private dash: Dash | null = null;
  private pending: Pending[] = [];
  private speed = PLAYER_SPEED;
  private canMove = true;

  constructor(private readonly map: CollisionMap) {}

  get pos(): Vec2 {
    return this.current;
  }

  get dashing(): boolean {
    return this.dash !== null;
  }

  /** Movement speed and whether the player may move (rooted, stunned, downed…), from the host. */
  setMotion(speed: number, canMove: boolean): void {
    this.speed = speed;
    this.canMove = canMove;
  }

  applyLocal(input: PlayerInput, dodge?: Vec2 | null): void {
    const p: Pending = dodge ? { input, dodge } : { input };
    this.pending.push(p);
    const r = this.step(this.current, this.dash, p);
    this.current = r.pos;
    this.dash = r.dash;
  }

  reconcile(serverPos: Vec2, lastAckSeq: number, serverDash: Dash | null = null): void {
    this.pending = this.pending.filter((i) => i.input.seq > lastAckSeq);
    let pos: Vec2 = { x: serverPos.x, y: serverPos.y };
    let dash: Dash | null = serverDash && serverDash.ticks > 0 ? { ...serverDash } : null;
    for (const p of this.pending) {
      const r = this.step(pos, dash, p);
      pos = r.pos;
      dash = r.dash;
    }
    this.current = pos;
    this.dash = dash;
  }

  private step(pos: Vec2, dash: Dash | null, p: Pending): { pos: Vec2; dash: Dash | null } {
    let d = dash;
    if (p.dodge && !d) {
      const per = BALANCE.dodge.distance / DASH_TICKS;
      d = { dx: p.dodge.x * per, dy: p.dodge.y * per, ticks: DASH_TICKS };
    }
    if (d) {
      const next = moveCircle(pos, PLAYER_RADIUS, d.dx, d.dy, this.map);
      const ticks = d.ticks - 1;
      return { pos: next, dash: ticks > 0 ? { ...d, ticks } : null };
    }
    if (!this.canMove) return { pos, dash: null };
    return { pos: stepPlayerMovement(pos, p.input, this.map, this.speed), dash: null };
  }
}
