import talentsJson from '../../../data/talents.json';
import type { StatKey, StatMod } from '../combat/defs';

export type TalentKind = 'start' | 'minor' | 'notable' | 'keystone';

export interface TalentNode {
  kind: TalentKind;
  /** Direction id (might…) or hybrid spoke id (might_celerity); 'start' for the centre. */
  dir: string;
  /** Position in the circle, -1..1 (for drawing). */
  x: number;
  y: number;
  mods: StatMod[];
  links: string[];
}

export interface TalentTree {
  /** The free centre node every character starts from. */
  start: string;
  /** Pure directions in circular order. */
  directions: string[];
  nodes: Record<string, TalentNode>;
}

export const TALENTS = talentsJson as unknown as TalentTree;

/** Bought nodes (rank is always 1). */
export type TalentAlloc = Record<string, number>;

export const talentPoints = (level: number) => Math.max(0, level - 1);

const nodeOf = (id: string): TalentNode | undefined => (Object.hasOwn(TALENTS.nodes, id) ? TALENTS.nodes[id] : undefined);
const owned = (a: TalentAlloc, id: string) => id === TALENTS.start || (Object.hasOwn(a, id) && a[id]! > 0);
const spent = (a: TalentAlloc) => Object.values(a).filter((r) => r > 0).length;

/** Whether `id` can be bought now: a real node, not owned, a point left, next to the centre or a bought node. */
export function canSpend(a: TalentAlloc, id: string, level: number): boolean {
  const node = nodeOf(id);
  if (!node || id === TALENTS.start || owned(a, id)) return false;
  if (spent(a) >= talentPoints(level)) return false;
  return node.links.some((l) => owned(a, l));
}

/** A valid tree: real nodes with rank 1, within the level's points, all connected to the centre through bought nodes. */
export function validateTalents(a: TalentAlloc, level: number): boolean {
  const ids = Object.keys(a);
  for (const id of ids) {
    const node = nodeOf(id);
    if (!node || id === TALENTS.start || a[id] !== 1) return false;
  }
  if (ids.length > talentPoints(level)) return false;
  const reached = new Set([TALENTS.start]);
  const queue = [TALENTS.start];
  while (queue.length) {
    for (const l of TALENTS.nodes[queue.pop()!]!.links) {
      if (!reached.has(l) && Object.hasOwn(a, l)) {
        reached.add(l);
        queue.push(l);
      }
    }
  }
  return ids.every((id) => reached.has(id));
}

/** Permanent stat modifiers granted by the bought nodes. */
export function talentMods(a: TalentAlloc): StatMod[] {
  const out: StatMod[] = [];
  for (const [id, r] of Object.entries(a)) {
    const node = nodeOf(id);
    if (!node || r <= 0) continue;
    for (const m of node.mods) out.push({ ...m, stat: m.stat as StatKey });
  }
  return out;
}
