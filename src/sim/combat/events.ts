import type { ActionAnim } from '../../appearance/catalog-types';
import type { EntityId } from '../types';
import type { School } from './defs';

/** Things that happened during a tick, sent reliably to every client in range. */
export type CombatEvent =
  | { e: 'hit'; src: EntityId | null; dst: EntityId; amount: number; crit: boolean; dodged: boolean; heal: boolean; absorbed: number; school: School }
  | { e: 'proj'; id: number; x: number; y: number; vx: number; vy: number; look: string; ttlMs: number }
  | { e: 'projEnd'; id: number; x: number; y: number }
  | { e: 'tele'; x: number; y: number; r: number; ms: number; hostile: boolean }
  | { e: 'area'; x: number; y: number; r: number; school: School }
  | { e: 'cast'; src: EntityId; anim: ActionAnim; facing: number }
  | { e: 'downed'; id: EntityId }
  | { e: 'revived'; id: EntityId }
  | { e: 'died'; id: EntityId }
  | { e: 'respawned'; id: EntityId }
  | { e: 'levelup'; id: EntityId; name: string; level: number };
