import type { StatMod } from '../../sim/combat/defs';
import { TALENTS } from '../../sim/progression/talents';
import { t } from '../i18n';

/** Stats stored as fractions but shown as percentages. */
const PERCENT_STATS = new Set(['critChance', 'dodgeChance', 'blockChance', 'critDamage', 'cooldownReduction', 'lifesteal']);
/** Stats where a lower value is the good direction (shown with the sign flipped). */
const INVERTED = new Set(['cooldownReduction']);

const num = (x: number) => (Math.round(x * 10) / 10).toLocaleString('es-ES');
const signed = (x: number) => (x < 0 ? `−${num(-x)}` : `+${num(x)}`);

/** "+3 % poder de ataque", "−2 % daño recibido", "+15 armadura", "−3 % recargas". */
export function describeMod(m: StatMod, ranks = 1): string {
  const name = t(`stat.${m.stat}`);
  if (m.pct) return `${signed(m.pct * 100 * ranks)} % ${name}`;
  const flat = (m.flat ?? 0) * ranks;
  if (PERCENT_STATS.has(m.stat)) return `${signed((INVERTED.has(m.stat) ? -flat : flat) * 100)} % ${name}`;
  return `${signed(flat)} ${name}`;
}

/** Tooltip of a talent node or bridge: what one rank gives. */
export function talentTooltip(id: string): string {
  const def = TALENTS.nodes[id] ?? TALENTS.bridges[id];
  if (!def) return '';
  return `${t(`talent.${id}`)}\n${t('talents.perRank')}: ${def.modsPerRank.map((m) => describeMod(m)).join(', ')}`;
}

/** Value of a summary stat for the character window. */
export function formatStat(key: string, value: number): string {
  if (PERCENT_STATS.has(key)) return `${num(value * 100)} %`;
  return num(value);
}

/** The order and grouping of the talent window: routes in circular order, nodes by tier. */
export function talentLayout(): { route: string; tiers: string[][] }[] {
  return TALENTS.routes.map((route) => {
    const tiers: string[][] = [[], [], [], []];
    for (const [id, n] of Object.entries(TALENTS.nodes)) if (n.route === route) tiers[n.tier - 1]!.push(id);
    for (const tier of tiers) tier.sort();
    return { route, tiers };
  });
}
