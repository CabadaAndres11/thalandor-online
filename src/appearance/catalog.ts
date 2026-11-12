import catalogJson from '../../data/appearance/catalog.json';
import type { AppearanceCatalog, GearSlot, LayerRef } from './catalog-types';

export type { AppearanceCatalog, LayerRef } from './catalog-types';

export const CLASS_IDS = ['warrior', 'cleric', 'mage', 'explorer'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export interface Appearance {
  body: string;
  skin: string;
  hairStyle: string;
  hairColor: string;
}

export const CATALOG = catalogJson as unknown as AppearanceCatalog;

const has = (list: { id: string }[], id: unknown) => typeof id === 'string' && list.some((o) => o.id === id);

export function isClassId(v: unknown): v is ClassId {
  return typeof v === 'string' && (CLASS_IDS as readonly string[]).includes(v);
}

export function isValidAppearance(a: unknown): a is Appearance {
  if (typeof a !== 'object' || a === null) return false;
  const x = a as Record<string, unknown>;
  return has(CATALOG.bodies, x.body) && has(CATALOG.skins, x.skin) && has(CATALOG.hairStyles, x.hairStyle) && has(CATALOG.hairColors, x.hairColor);
}

/** The first option of every list; the same for every class for now. */
export function defaultAppearance(_classId: ClassId): Appearance {
  return {
    body: CATALOG.bodies[0]!.id,
    skin: CATALOG.skins[0]!.id,
    hairStyle: CATALOG.hairStyles[0]!.id,
    hairColor: CATALOG.hairColors[0]!.id,
  };
}

/** Look id per equipment slot (from equipped items). */
export type GearLooks = Partial<Record<GearSlot, string>>;

export const gearLook = (id: string) => (Object.hasOwn(CATALOG.layers.gear, id) ? CATALOG.layers.gear[id] : undefined);

/** All layers to draw for a character, back to front. Equipped looks replace the class outfit in their slot. */
export function resolveLayers(classId: ClassId, a: Appearance, gear: GearLooks = {}): LayerRef[] {
  const worn: LayerRef[] = [];
  const covered = new Set<GearSlot>();
  for (const [slot, id] of Object.entries(gear) as [GearSlot, string][]) {
    const look = id ? gearLook(id) : undefined;
    if (!look || look.slot !== slot) continue;
    covered.add(slot);
    worn.push(...(look.bodies[a.body] ?? []));
  }
  const outfit = (CATALOG.layers.outfit[classId]?.[a.body] ?? []).filter((l) => !l.slot || !covered.has(l.slot));
  const layers = [
    ...(CATALOG.layers.body[a.body] ?? []),
    ...outfit,
    ...worn,
    ...(CATALOG.layers.hair[a.hairStyle] ? [CATALOG.layers.hair[a.hairStyle]!] : []),
  ];
  return layers.sort((x, y) => x.zIndex - y.zIndex);
}

/** Fixed layer stack of a humanoid monster, back to front ([] if unknown). */
export function monsterLayers(id: string): LayerRef[] {
  const ls = Object.hasOwn(CATALOG.layers.monster, id) ? CATALOG.layers.monster[id]! : [];
  return [...ls].sort((x, y) => x.zIndex - y.zIndex);
}

/** Every layer in the catalog (players and monsters). */
export function allLayers(): LayerRef[] {
  const out: LayerRef[] = [];
  for (const ls of Object.values(CATALOG.layers.body)) out.push(...ls);
  out.push(...Object.values(CATALOG.layers.hair));
  for (const byBody of Object.values(CATALOG.layers.outfit)) for (const ls of Object.values(byBody)) out.push(...ls);
  for (const ls of Object.values(CATALOG.layers.monster)) out.push(...ls);
  for (const g of Object.values(CATALOG.layers.gear)) for (const ls of Object.values(g.bodies)) out.push(...ls);
  return out;
}
