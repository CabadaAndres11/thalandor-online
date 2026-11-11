export type EntityId = number;

export interface Vec2 {
  x: number;
  y: number;
}

/** One tick worth of player intent. moveX/moveY are -1, 0 or 1; aim is in world coordinates. */
export interface PlayerInput {
  seq: number;
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
}
