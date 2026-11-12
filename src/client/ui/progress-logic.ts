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

/** Tooltip of a talent node: its name and what it gives. */
export function talentTooltip(id: string): string {
  const node = Object.hasOwn(TALENTS.nodes, id) ? TALENTS.nodes[id] : undefined;
  if (!node) return '';
  const name = t(`talent.${id}`);
  return node.mods.length ? `${name}\n${node.mods.map((m) => describeMod(m)).join(', ')}` : name;
}

/** Value of a summary stat for the character window. */
export function formatStat(key: string, value: number): string {
  if (PERCENT_STATS.has(key)) return `${num(value * 100)} %`;
  return num(value);
}
