import { ability, CLASSES, ICON_GLYPHS, type Slot } from '../../sim/combat/defs';

export type Glyph = (typeof ICON_GLYPHS)[number];

/** "glyph:#rrggbb" -> parts; unknown specs fall back to a neutral icon. */
export function parseIcon(spec: string): { glyph: Glyph; color: string } {
  const [glyph, color] = spec.split(':');
  const okGlyph = (ICON_GLYPHS as readonly string[]).includes(glyph ?? '');
  const okColor = /^#[0-9a-f]{6}$/i.test(color ?? '');
  return okGlyph && okColor ? { glyph: glyph as Glyph, color: color!.toLowerCase() } : { glyph: (okGlyph ? glyph : 'star') as Glyph, color: '#888888' };
}

/** Remaining cooldown as a fraction (for the sweep) and a label (one decimal under 2 s). */
export function cooldownView(remainingMs: number, totalMs: number): { fraction: number; label: string } {
  if (remainingMs <= 0 || totalMs <= 0) return { fraction: 0, label: '' };
  const fraction = Math.min(1, remainingMs / totalMs);
  const s = remainingMs / 1000;
  return { fraction, label: s < 2 ? s.toFixed(1) : String(Math.ceil(s)) };
}

export interface HotbarSlot {
  slot: Slot;
  key: string;
  abilityId: string | null;
  cost: number;
  cooldownMs: number;
  icon: string | null;
  nameKey: string | null;
}

const KEYS: Record<Slot, string> = { lmb: 'CI', rmb: 'CD', s1: '1', s2: '2', s3: '3', s4: '4', dodge: '␣' };
const ORDER: Slot[] = ['lmb', 'rmb', 's1', 's2', 's3', 's4', 'dodge'];

/** The 7 hotbar squares, in display order: the given loadout (from the host) or the class defaults. */
export function hotbarFor(classId: string, loadout?: Partial<Record<Exclude<Slot, 'dodge'>, string | null>>): HotbarSlot[] {
  const slots = loadout ?? CLASSES[classId]?.slots;
  return ORDER.map((slot) => {
    const id = slot === 'dodge' ? 'dodge' : (slots?.[slot] ?? null);
    const ab = id ? ability(id) : undefined;
    return {
      slot,
      key: KEYS[slot],
      abilityId: ab ? ab.id : null,
      cost: ab?.cost ?? 0,
      cooldownMs: ab?.cooldownMs ?? 0,
      icon: ab?.icon ?? null,
      nameKey: ab?.nameKey ?? null,
    };
  });
}

/** Experience bar: fraction of the level done and its label. */
export function xpView(p: { level: number; xp: number; xpToNext: number }): { fraction: number; label: string } {
  if (p.xpToNext <= 0) return { fraction: 1, label: `${p.level}` };
  return { fraction: Math.min(1, p.xp / p.xpToNext), label: `${p.xp} / ${p.xpToNext}` };
}

/** Text and style of a floating combat number; i18n keys for dodge/absorb. null = nothing to show. */
export function floatingText(h: { amount: number; crit: boolean; dodged: boolean; heal: boolean; absorbed: number }): {
  text: string;
  kind: 'damage' | 'crit' | 'heal' | 'miss';
} | null {
  if (h.dodged) return { text: 'hud.dodged', kind: 'miss' };
  if (h.heal) return h.amount > 0 ? { text: `+${h.amount}`, kind: 'heal' } : null;
  if (h.amount <= 0) return h.absorbed > 0 ? { text: 'hud.absorbed', kind: 'miss' } : null;
  return h.crit ? { text: `${h.amount}!`, kind: 'crit' } : { text: String(h.amount), kind: 'damage' };
}
