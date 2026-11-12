export type EntityId = number;

export interface Vec2 {
  x: number;
  y: number;
}

/** One tick worth of player intent. moveX/moveY are -1, 0 or 1; aim is in world coordinates. */
/** Ability slots a player can press (dodge is the common Space dodge). */
export type PressSlot = 'lmb' | 'rmb' | 's1' | 's2' | 's3' | 's4' | 'dodge';

/** A discrete key press, repeated in every input until the host acknowledges it (me.lastPressSeq). */
export interface Press {
  seq: number;
  slot: PressSlot;
  aimX: number;
  aimY: number;
}

export interface PlayerInput {
  seq: number;
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  /** Held buttons bitmask (BUTTON in sim/combat/unit.ts). */
  buttons?: number;
  /** Unacknowledged presses. */
  presses?: Press[];
}
