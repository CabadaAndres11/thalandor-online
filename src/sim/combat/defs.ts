import balanceJson from '../../../data/balance.json';
import classesJson from '../../../data/classes.json';
import monstersJson from '../../../data/monsters.json';
import warrior from '../../../data/abilities/warrior.json';
import cleric from '../../../data/abilities/cleric.json';
import mage from '../../../data/abilities/mage.json';
import explorer from '../../../data/abilities/explorer.json';
import monsterAbilities from '../../../data/abilities/monsters.json';
import common from '../../../data/abilities/common.json';
import type { ActionAnim } from '../../appearance/catalog-types';

export type School = 'physical' | 'holy' | 'fire' | 'frost' | 'arcane' | 'nature';
export type AbilityAnim = ActionAnim | 'none';
export type Slot = 'lmb' | 'rmb' | 's1' | 's2' | 's3' | 's4' | 'dodge';
export const SLOTS: readonly Slot[] = ['lmb', 'rmb', 's1', 's2', 's3', 's4', 'dodge'];
export type ResourceKind = 'rage' | 'mana' | 'energy' | 'none';
export type StatKey =
  | 'maxHp'
  | 'maxResource'
  | 'attackPower'
  | 'spellPower'
  | 'critChance'
  | 'dodgeChance'
  | 'armor'
  | 'moveSpeed'
  | 'hpRegen'
  | 'manaRegen'
  | 'healingReceived'
  | 'healingDone'
  | 'damageDone'
  | 'damageTaken'
  | 'critDamage'
  | 'cooldownReduction'
  | 'lifesteal'
  | 'blockChance'
  | 'threatMultiplier';

export type ShapeDef =
  | { type: 'melee_arc'; radius: number; arcDeg: number }
  | { type: 'projectile'; speed: number; radius: number; pierce: boolean; look: string }
  | { type: 'area_target'; radius: number; delayMs: number; atSelf?: boolean }
  | { type: 'area_self'; radius: number }
  | { type: 'ally_target' }
  | { type: 'self' }
  | { type: 'dash'; distance: number; stopOnHit: boolean; backwards?: boolean }
  | { type: 'blink'; distance: number };

export type EffectTo = 'enemies' | 'allies' | 'self';

export type EffectDef =
  | { type: 'damage'; base: number; coef: number; to?: EffectTo }
  | { type: 'heal'; base: number; coef: number; to?: EffectTo }
  | { type: 'shield'; base: number; coef: number; durationMs: number; to?: EffectTo }
  | { type: 'buff' | 'debuff'; stat: StatKey; pct: number; durationMs: number; to?: EffectTo }
  | { type: 'dot' | 'hot'; base: number; coef: number; tickMs: number; durationMs: number; to?: EffectTo }
  | { type: 'stun' | 'root' | 'freeze' | 'taunt'; durationMs: number; to?: EffectTo }
  | { type: 'slow'; pct: number; durationMs: number; to?: EffectTo }
  | { type: 'resource'; amount: number; to?: EffectTo };

export interface AbilityDef {
  id: string;
  nameKey: string;
  icon: string;
  school: School;
  anim: AbilityAnim;
  cost: number;
  cooldownMs: number;
  gcd: boolean;
  range: number;
  dodgeable: boolean;
  shape: ShapeDef;
  effects: EffectDef[];
  /** Resource gained by the caster when the ability hits at least one enemy (e.g. rage). */
  gainOnHit?: number;
  /** Ability cast right after this one (e.g. a roll that fires a shot). */
  then?: string;
}

export interface StatMod {
  stat: StatKey;
  flat?: number;
  pct?: number;
}

export interface PassiveDef {
  id: string;
  nameKey: string;
  mods?: StatMod[];
  rageDecayFactor?: number;
  combatManaRegenFactor?: number;
  concentration?: { afterMs: number; spellDamagePct: number };
}

export interface Attributes {
  strength: number;
  agility: number;
  intellect: number;
  stamina: number;
  spirit: number;
}

export interface ClassDef {
  resource: ResourceKind;
  attributes: Attributes;
  armor: number;
  /** Attributes gained automatically per level above 1. */
  growth: Partial<Attributes>;
  slots: Record<Exclude<Slot, 'dodge'>, string | null>;
  passives: PassiveDef[];
}

export interface MonsterDef {
  id: string;
  nameKey: string;
  look: { kind: 'layers' | 'creature'; id: string };
  level: number;
  stats: { maxHp: number; armor: number; power: number; moveSpeed: number };
  radius: number;
  aggroRange: number;
  leashRange: number;
  abilities: string[];
  behavior: 'melee' | 'ranged' | 'pack';
  keepDistance?: number;
  elite: boolean;
}

export const BALANCE = balanceJson;

const withIds = <T>(rec: Record<string, Omit<T, 'id'>>): Record<string, T> =>
  Object.fromEntries(Object.entries(rec).map(([id, v]) => [id, { ...v, id } as T]));

export const ABILITIES: Record<string, AbilityDef> = withIds<AbilityDef>({
  ...(warrior as Record<string, Omit<AbilityDef, 'id'>>),
  ...(cleric as Record<string, Omit<AbilityDef, 'id'>>),
  ...(mage as Record<string, Omit<AbilityDef, 'id'>>),
  ...(explorer as Record<string, Omit<AbilityDef, 'id'>>),
  ...(monsterAbilities as Record<string, Omit<AbilityDef, 'id'>>),
  ...(common as Record<string, Omit<AbilityDef, 'id'>>),
});

export const CLASSES = classesJson as unknown as Record<string, ClassDef>;
export const MONSTERS: Record<string, MonsterDef> = withIds<MonsterDef>(monstersJson as unknown as Record<string, Omit<MonsterDef, 'id'>>);

export function ability(id: string): AbilityDef | undefined {
  return Object.hasOwn(ABILITIES, id) ? ABILITIES[id] : undefined;
}

const SHAPES = new Set(['melee_arc', 'projectile', 'area_target', 'area_self', 'ally_target', 'self', 'dash', 'blink']);
const EFFECTS = new Set(['damage', 'heal', 'shield', 'buff', 'debuff', 'dot', 'hot', 'stun', 'root', 'freeze', 'taunt', 'slow', 'resource']);
const SCHOOLS = new Set(['physical', 'holy', 'fire', 'frost', 'arcane', 'nature']);
const ANIMS = new Set(['slash', 'thrust', 'spellcast', 'shoot', 'hurt', 'none']);
export const ICON_GLYPHS = ['sword', 'axe', 'dagger', 'arrow', 'star', 'cross', 'shield', 'drop', 'burst', 'bolt', 'wing', 'snow', 'spiral', 'wind', 'net', 'rain'] as const;

/** Returns a list of problems in the data files (empty when everything is consistent). */
export function validateDefs(texts: Record<string, string>): string[] {
  const errors: string[] = [];
  for (const a of Object.values(ABILITIES)) {
    const where = `ability ${a.id}`;
    if (!SHAPES.has(a.shape?.type)) errors.push(`${where}: unknown shape ${a.shape?.type}`);
    if (!SCHOOLS.has(a.school)) errors.push(`${where}: unknown school ${a.school}`);
    if (!ANIMS.has(a.anim)) errors.push(`${where}: unknown anim ${a.anim}`);
    if (!(a.nameKey in texts)) errors.push(`${where}: missing text ${a.nameKey}`);
    const [glyph, color] = (a.icon ?? '').split(':');
    if (!(ICON_GLYPHS as readonly string[]).includes(glyph ?? '') || !/^#[0-9a-f]{6}$/i.test(color ?? '')) errors.push(`${where}: bad icon ${a.icon}`);
    for (const e of a.effects) if (!EFFECTS.has(e.type)) errors.push(`${where}: unknown effect ${e.type}`);
    if (a.then && !ability(a.then)) errors.push(`${where}: unknown follow-up ${a.then}`);
  }
  for (const [id, c] of Object.entries(CLASSES)) {
    for (const [slot, ab] of Object.entries(c.slots)) if (ab && !ability(ab)) errors.push(`class ${id}: slot ${slot} has unknown ability ${ab}`);
    for (const p of c.passives) if (!(p.nameKey in texts)) errors.push(`class ${id}: missing text ${p.nameKey}`);
  }
  for (const m of Object.values(MONSTERS)) {
    if (!(m.nameKey in texts)) errors.push(`monster ${m.id}: missing text ${m.nameKey}`);
    for (const ab of m.abilities) if (!ability(ab)) errors.push(`monster ${m.id}: unknown ability ${ab}`);
  }
  return errors;
}
