import talentsJson from '../../../data/talents.json';
import type { StatKey, StatMod } from '../combat/defs';

export interface TalentNode {
  route: string;
  tier: number;
  maxRank: number;
  modsPerRank: StatMod[];
}

export interface TalentBridge {
  routes: [string, string];
  maxRank: number;
  modsPerRank: StatMod[];
}

export interface TalentTree {
  /** Circular order: neighbours share a bridge. */
  routes: string[];
  /** Points needed in lower tiers of the route, indexed by tier. */
  tierRequirement: number[];
  bridgeRequirement: number;
  nodes: Record<string, TalentNode>;
  bridges: Record<string, TalentBridge>;
}

export const TALENTS = talentsJson as unknown as TalentTree;

/** Rank per node id (nodes and bridges). */
export type TalentAlloc = Record<string, number>;

export const talentPoints = (level: number) => Math.max(0, level - 1);

const maxRankOf = (id: string) => TALENTS.nodes[id]?.maxRank ?? TALENTS.bridges[id]?.maxRank;
const spent = (a: TalentAlloc) => Object.values(a).reduce((s, r) => s + r, 0);

function routePoints(a: TalentAlloc, route: string, belowTier = Infinity): number {
  let n = 0;
  for (const [id, r] of Object.entries(a)) {
    const node = TALENTS.nodes[id];
    if (node && node.route === route && node.tier < belowTier) n += r;
  }
  return n;
}

function requirementMet(a: TalentAlloc, id: string): boolean {
  const node = TALENTS.nodes[id];
  if (node) return routePoints(a, node.route, node.tier) >= (TALENTS.tierRequirement[node.tier] ?? Infinity);
  const bridge = TALENTS.bridges[id];
  return !!bridge && bridge.routes.every((r) => routePoints(a, r) >= TALENTS.bridgeRequirement);
}

/** Whether one more rank can go into `id` (GDD annex C). */
export function canSpend(a: TalentAlloc, id: string, level: number): boolean {
  const max = maxRankOf(id);
  if (max === undefined || (a[id] ?? 0) >= max) return false;
  if (spent(a) >= talentPoints(level)) return false;
  return requirementMet(a, id);
}

/**
 * A tree is valid if some purchase order reaches it. Buying lower tiers first is always best,
 * so every allocated node must meet its requirement with the final allocation of lower tiers.
 */
export function validateTalents(a: TalentAlloc, level: number): boolean {
  for (const [id, r] of Object.entries(a)) {
    const max = maxRankOf(id);
    if (max === undefined || !Number.isInteger(r) || r < 0 || r > max) return false;
    if (r > 0 && !requirementMet(a, id)) return false;
  }
  return spent(a) <= talentPoints(level);
}

/** Permanent stat modifiers granted by an allocation. */
export function talentMods(a: TalentAlloc): StatMod[] {
  const out: StatMod[] = [];
  for (const [id, r] of Object.entries(a)) {
    const def = TALENTS.nodes[id] ?? TALENTS.bridges[id];
    if (!def || r <= 0) continue;
    for (const m of def.modsPerRank) {
      const mod: StatMod = { stat: m.stat as StatKey };
      if (m.flat) mod.flat = round(m.flat * r);
      if (m.pct) mod.pct = round(m.pct * r);
      out.push(mod);
    }
  }
  return out;
}

const round = (x: number) => Math.round(x * 1e6) / 1e6;
