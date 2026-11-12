/** Simulation ticks per second (GDD §2.2). */
export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
/** Provisional tile size in pixels until the asset packs are chosen (GDD §11). */
export const TILE_SIZE = 32;
/** Player movement speed in pixels per second. */
export const PLAYER_SPEED = 120;
export const PLAYER_RADIUS = 10;
/** How tall a character's drawn body is above its feet (pixels): projectiles hit anywhere on it. */
export const BODY_HEIGHT = 40;
export const MAX_PLAYERS = 4;
/** Remote entities are drawn this far in the past so there are two snapshots to blend (GDD 2.2). */
export const INTERP_DELAY_MS = 100;
