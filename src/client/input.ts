import type { PlayerInput, Vec2 } from '../sim/types';

export interface DirectionKeys {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/** Converts held direction keys and the aim point into one tick of player input (without seq). */
export function inputFromKeys(keys: DirectionKeys, aimWorld: Vec2): Omit<PlayerInput, 'seq'> {
  return {
    moveX: (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
    moveY: (keys.down ? 1 : 0) - (keys.up ? 1 : 0),
    aimX: aimWorld.x,
    aimY: aimWorld.y,
  };
}
