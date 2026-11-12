/**
 * Generates data/items/bases.json and the item names in data/i18n/es.json.
 * Usage: npx tsx tools/gen-items.ts
 *
 * Each base is one kind of item (e.g. "Yelmo nasal de hierro") with a slot, an armour or weapon
 * type, a level band where it drops, a visible look (tools/gear-looks.ts) and stats that scale with level.
 */
import { readFileSync, writeFileSync } from 'node:fs';

type Slot = 'weapon' | 'offhand' | 'head' | 'shoulders' | 'chest' | 'hands' | 'legs' | 'feet' | 'neck' | 'ring';
/** stat: an attribute or a StatKey; value = base + perLevel × itemLevel. */
interface BaseStat {
  stat: string;
  base?: number;
  perLevel: number;
}
interface Base {
  nameKey: string;
  slot: Slot;
  kind: string;
  minLevel: number;
  maxLevel: number;
  look?: string;
  icon: string;
  stats: BaseStat[];
}

const bases: Record<string, Base> = {};
const names: Record<string, string> = {};
const add = (id: string, name: string, b: Omit<Base, 'nameKey'>) => {
  bases[id] = { nameKey: `item.${id}`, ...b };
  names[`item.${id}`] = name;
};

/** Level bands: tier 0 drops at 1–10, tier 1 at 8–20, tier 2 at 18–30. */
const TIERS = [
  [1, 10],
  [8, 20],
  [18, 30],
] as const;

/** Share of an armour set's stats carried by each slot. */
const WEIGHT: Record<string, number> = { chest: 1, legs: 0.8, head: 0.6, shoulders: 0.5, hands: 0.4, feet: 0.4 };
const ARMOR_PER_LEVEL: Record<string, number> = { cloth: 0.25, leather: 0.5, mail: 0.8, plate: 1.2 };
const MAIN: Record<string, [string, string]> = { cloth: ['intellect', 'spirit'], leather: ['agility', 'stamina'], mail: ['agility', 'strength'], plate: ['strength', 'stamina'] };
const r2 = (x: number) => Math.round(x * 100) / 100;

function armourStats(kind: string, slot: string): BaseStat[] {
  const w = WEIGHT[slot]!;
  const [a, b] = MAIN[kind]!;
  const stats: BaseStat[] = [{ stat: 'armor', base: 1, perLevel: r2(ARMOR_PER_LEVEL[kind]! * w) }, { stat: a, perLevel: r2(0.5 * w) }];
  if (kind === 'mail') stats.push({ stat: b, perLevel: r2(0.25 * w) }, { stat: 'stamina', perLevel: r2(0.3 * w) });
  else stats.push({ stat: b, perLevel: r2(0.4 * w) });
  return stats;
}

/** [slot, kind, tier] -> [id suffix, Spanish name, look id, icon]. */
type Row = [string, string, string, string];
const ARMOUR: Record<string, Record<string, [Row, Row, Row]>> = {
  cloth: {
    head: [['hood', 'Capucha de aprendiz', 'head_hood_brown', 'wing:#b8a07a'], ['wizard', 'Sombrero de adepto', 'head_wizard_blue', 'star:#6f8fd8'], ['wizard_black', 'Sombrero de archimago', 'head_wizard_black', 'star:#9a7cd0']],
    shoulders: [['mantle', 'Esclavina de aprendiz', 'shoulders_mantal_navy', 'shield:#6a7aa8'], ['mantle_purple', 'Esclavina de adepto', 'shoulders_mantal_purple', 'shield:#9a6ad0'], ['mantle_maroon', 'Esclavina de archimago', 'shoulders_mantal_maroon', 'shield:#b04a5a']],
    chest: [['shirt', 'Túnica de aprendiz', 'chest_shirt_white', 'shield:#d8d0c0'], ['robe_blue', 'Túnica de adepto', 'chest_robe_blue', 'shield:#5a7ad0'], ['robe_purple', 'Túnica de archimago', 'chest_robe_purple', 'shield:#9a5ad0']],
    hands: [['wraps', 'Vendas de aprendiz', 'hands_bracers', 'drop:#b8a07a'], ['gloves_silver', 'Guantes de adepto', 'hands_gloves_silver', 'drop:#c0c8d0'], ['gloves_gold', 'Guantes de archimago', 'hands_gloves_gold', 'drop:#e0c060']],
    legs: [['pants', 'Calzas de aprendiz', 'legs_pants_white', 'shield:#d8d0c0'], ['pants_navy', 'Calzas de adepto', 'legs_pants_navy', 'shield:#5a6aa8'], ['pants_purple', 'Calzas de archimago', 'legs_pants_purple', 'shield:#9a5ad0']],
    feet: [['shoes', 'Sandalias de aprendiz', 'feet_shoes', 'wind:#b8a07a'], ['slippers', 'Zapatillas de adepto', 'feet_fold_gray', 'wind:#9aa0a8'], ['slippers_black', 'Zapatillas de archimago', 'feet_fold_black', 'wind:#5a5a6a']],
  },
  leather: {
    head: [['cap', 'Gorro de cuero', 'head_cap_brown', 'wing:#9a6a3a'], ['hood_forest', 'Capucha de rastreador', 'head_hood_forest', 'wing:#4a8a4a'], ['hood_black', 'Capucha de sombra', 'head_hood_black', 'wing:#3a3a4a']],
    shoulders: [['pads', 'Hombreras de cuero', 'shoulders_pauldrons_brown', 'shield:#9a6a3a'], ['pads_black', 'Hombreras de rastreador', 'shoulders_pauldrons_black', 'shield:#4a4a5a'], ['pads_maroon', 'Hombreras de sombra', 'shoulders_pauldrons_maroon', 'shield:#8a3a4a']],
    chest: [['jerkin', 'Jubón de cuero', 'chest_leather', 'shield:#9a6a3a'], ['shirt_forest', 'Jubón de rastreador', 'chest_shirt_forest', 'shield:#4a8a4a'], ['shirt_black', 'Jubón de sombra', 'chest_shirt_black', 'shield:#3a3a4a']],
    hands: [['bracers', 'Brazales de cuero', 'hands_bracers', 'drop:#9a6a3a'], ['gloves_bronze', 'Guantes de rastreador', 'hands_gloves_bronze', 'drop:#c08a4a'], ['gloves_iron', 'Guantes de sombra', 'hands_gloves_iron', 'drop:#8a8a9a']],
    legs: [['leggings', 'Polainas de cuero', 'legs_leggings_leather', 'shield:#9a6a3a'], ['leggings_forest', 'Polainas de rastreador', 'legs_leggings_forest', 'shield:#4a8a4a'], ['leggings_black', 'Polainas de sombra', 'legs_leggings_black', 'shield:#3a3a4a']],
    feet: [['boots', 'Botas de cuero', 'feet_boots', 'wind:#9a6a3a'], ['boots_rimmed', 'Botas de rastreador', 'feet_rimmed_brown', 'wind:#8a5a2a'], ['boots_black', 'Botas de sombra', 'feet_rimmed_black', 'wind:#3a3a4a']],
  },
  mail: {
    head: [['coif', 'Cofia de malla de hierro', 'head_mail_iron', 'wing:#8a8a9a'], ['coif_steel', 'Cofia de malla de acero', 'head_mail_steel', 'wing:#b0b8c0'], ['nasal_silver', 'Yelmo nasal de plata', 'head_nasal_silver', 'wing:#d0d8e0']],
    shoulders: [['pads', 'Hombreras de malla', 'shoulders_pauldrons_gray', 'shield:#8a8a9a'], ['legion_steel', 'Hombreras de legionario', 'shoulders_legion_steel', 'shield:#b0b8c0'], ['legion_silver', 'Hombreras de plata', 'shoulders_legion_silver', 'shield:#d0d8e0']],
    chest: [['hauberk', 'Cota de malla de hierro', 'chest_mail_iron', 'shield:#8a8a9a'], ['hauberk_steel', 'Cota de malla de acero', 'chest_mail_steel', 'shield:#b0b8c0'], ['hauberk_silver', 'Cota de malla de plata', 'chest_mail_silver', 'shield:#d0d8e0']],
    hands: [['gloves', 'Guantes de malla de hierro', 'hands_gloves_iron', 'drop:#8a8a9a'], ['gloves_steel', 'Guantes de malla de acero', 'hands_gloves_steel', 'drop:#b0b8c0'], ['gloves_silver', 'Guantes de malla de plata', 'hands_gloves_silver', 'drop:#d0d8e0']],
    legs: [['chausses', 'Calzas de malla', 'legs_leggings_gray', 'shield:#8a8a9a'], ['chausses_black', 'Calzas de malla reforzada', 'legs_leggings_black', 'shield:#5a5a6a'], ['chausses_steel', 'Grebas ligeras de acero', 'legs_plate_steel', 'shield:#b0b8c0']],
    feet: [['boots', 'Botas de malla', 'feet_fold_gray', 'wind:#8a8a9a'], ['boots_black', 'Botas de malla reforzada', 'feet_fold_black', 'wind:#5a5a6a'], ['sabatons', 'Escarpes ligeros de acero', 'feet_plate_steel', 'wind:#b0b8c0']],
  },
  plate: {
    head: [['nasal', 'Yelmo nasal de hierro', 'head_nasal_iron', 'wing:#8a8a9a'], ['barbuta', 'Barbuta de acero', 'head_barbuta_steel', 'wing:#b0b8c0'], ['greathelm', 'Gran yelmo dorado', 'head_greathelm_gold', 'wing:#e0c060']],
    shoulders: [['legion', 'Hombreras de hierro', 'shoulders_legion_iron', 'shield:#8a8a9a'], ['legion_bronze', 'Hombreras de bronce', 'shoulders_legion_bronze', 'shield:#c08a4a'], ['legion_gold', 'Hombreras doradas', 'shoulders_legion_gold', 'shield:#e0c060']],
    chest: [['plate', 'Peto de hierro', 'chest_plate_iron', 'shield:#8a8a9a'], ['plate_steel', 'Peto de acero', 'chest_plate_steel', 'shield:#b0b8c0'], ['plate_gold', 'Peto dorado', 'chest_plate_gold', 'shield:#e0c060']],
    hands: [['gauntlets', 'Guanteletes de hierro', 'hands_gauntlets_iron', 'drop:#8a8a9a'], ['gauntlets_steel', 'Guanteletes de acero', 'hands_gauntlets_steel', 'drop:#b0b8c0'], ['gauntlets_gold', 'Guanteletes dorados', 'hands_gauntlets_gold', 'drop:#e0c060']],
    legs: [['greaves', 'Grebas de hierro', 'legs_plate_iron', 'shield:#8a8a9a'], ['greaves_steel', 'Grebas de acero', 'legs_plate_steel', 'shield:#b0b8c0'], ['greaves_gold', 'Grebas doradas', 'legs_plate_gold', 'shield:#e0c060']],
    feet: [['sabatons', 'Escarpes de hierro', 'feet_plate_iron', 'wind:#8a8a9a'], ['sabatons_steel', 'Escarpes de acero', 'feet_plate_steel', 'wind:#b0b8c0'], ['sabatons_gold', 'Escarpes dorados', 'feet_plate_gold', 'wind:#e0c060']],
  },
};
for (const [kind, bySlot] of Object.entries(ARMOUR)) {
  for (const [slot, rows] of Object.entries(bySlot)) {
    rows.forEach(([suffix, name, look, icon], tier) => {
      const [minLevel, maxLevel] = TIERS[tier]!;
      add(`${kind}_${slot}_${suffix}`, name, { slot: slot as Slot, kind, minLevel, maxLevel, look, icon, stats: armourStats(kind, slot) });
    });
  }
}

/** Weapons: power per level, plus a main attribute. */
const WEAPONS: [string, string, string, string, BaseStat[], number][] = [
  // id, name, kind, look, stats, tier
  ['sword_arming', 'Espada de hierro', 'sword', 'weapon_arming_iron', [{ stat: 'attackPower', base: 4, perLevel: 2 }, { stat: 'strength', perLevel: 0.3 }], 0],
  ['sword_saber', 'Sable de acero', 'sword', 'weapon_saber', [{ stat: 'attackPower', base: 4, perLevel: 2 }, { stat: 'strength', perLevel: 0.3 }], 1],
  ['sword_long', 'Espada larga', 'sword', 'weapon_longsword', [{ stat: 'attackPower', base: 4, perLevel: 2.1 }, { stat: 'strength', perLevel: 0.3 }], 2],
  ['sword_gold', 'Espada dorada', 'sword', 'weapon_arming_gold', [{ stat: 'attackPower', base: 4, perLevel: 2.1 }, { stat: 'critChance', perLevel: 0.0005 }], 2],
  ['axe_war', 'Hacha de guerra', 'axe', 'weapon_waraxe', [{ stat: 'attackPower', base: 5, perLevel: 2.2 }], 1],
  ['mace_iron', 'Maza de hierro', 'mace', 'weapon_mace', [{ stat: 'attackPower', base: 3, perLevel: 1.2 }, { stat: 'spellPower', base: 3, perLevel: 1.2 }], 0],
  ['mace_flail', 'Mangual', 'mace', 'weapon_flail', [{ stat: 'attackPower', base: 3, perLevel: 1.3 }, { stat: 'spellPower', base: 3, perLevel: 1.3 }], 2],
  ['staff_simple', 'Bastón de aprendiz', 'staff', 'weapon_staff_simple', [{ stat: 'spellPower', base: 4, perLevel: 2.2 }, { stat: 'intellect', perLevel: 0.3 }], 0],
  ['staff_gnarled', 'Bastón nudoso', 'staff', 'weapon_staff_gnarled_medium', [{ stat: 'spellPower', base: 4, perLevel: 2.2 }, { stat: 'spirit', perLevel: 0.3 }], 1],
  ['staff_crystal', 'Bastón de cristal', 'staff', 'weapon_staff_crystal_blue', [{ stat: 'spellPower', base: 4, perLevel: 2.3 }, { stat: 'intellect', perLevel: 0.35 }], 2],
  ['staff_ember', 'Bastón de ascuas', 'staff', 'weapon_staff_crystal_red', [{ stat: 'spellPower', base: 4, perLevel: 2.3 }, { stat: 'critDamage', perLevel: 0.002 }], 2],
  ['bow_short', 'Arco corto', 'bow', 'weapon_bow_light', [{ stat: 'attackPower', base: 4, perLevel: 1.9 }, { stat: 'agility', perLevel: 0.3 }], 0],
  ['bow_recurve', 'Arco recurvo', 'bow', 'weapon_recurve_medium', [{ stat: 'attackPower', base: 4, perLevel: 2 }, { stat: 'agility', perLevel: 0.3 }], 1],
  ['bow_dark', 'Arco de sombra', 'bow', 'weapon_recurve_dark', [{ stat: 'attackPower', base: 4, perLevel: 2.1 }, { stat: 'critChance', perLevel: 0.0005 }], 2],
  ['dagger', 'Daga', 'dagger', 'weapon_dagger', [{ stat: 'attackPower', base: 3, perLevel: 1.8 }, { stat: 'agility', perLevel: 0.35 }], 1],
];
const WEAPON_ICON: Record<string, string> = { sword: 'sword:#b0b8c0', axe: 'axe:#a0a8b0', mace: 'cross:#c0a060', staff: 'spiral:#9a7cd0', bow: 'arrow:#c8a46a', dagger: 'dagger:#c0c8d0' };
for (const [id, name, kind, look, stats, tier] of WEAPONS) {
  const [minLevel, maxLevel] = tier === 1 ? [1, 30] : TIERS[tier]!;
  add(id, name, { slot: 'weapon', kind, minLevel, maxLevel, look, icon: WEAPON_ICON[kind]!, stats });
}

/** Off-hand: shields (warrior, cleric), orbs (cleric, mage), quivers (explorer). */
const OFFHAND: [string, string, string, string | undefined, string, BaseStat[], number][] = [
  ['shield_round', 'Escudo redondo', 'shield', 'offhand_round_brown', 'shield:#9a6a3a', [{ stat: 'armor', base: 2, perLevel: 0.8 }, { stat: 'blockChance', perLevel: 0.001 }, { stat: 'stamina', perLevel: 0.25 }], 0],
  ['shield_kite', 'Escudo de cometa', 'shield', 'offhand_kite_gray', 'shield:#b0b8c0', [{ stat: 'armor', base: 2, perLevel: 0.9 }, { stat: 'blockChance', perLevel: 0.0012 }, { stat: 'stamina', perLevel: 0.25 }], 1],
  ['shield_spartan', 'Escudo de bronce', 'shield', 'offhand_spartan', 'shield:#c08a4a', [{ stat: 'armor', base: 2, perLevel: 1 }, { stat: 'blockChance', perLevel: 0.0013 }, { stat: 'stamina', perLevel: 0.3 }], 2],
  ['shield_round_gold', 'Escudo dorado', 'shield', 'offhand_round_gold', 'shield:#e0c060', [{ stat: 'armor', base: 2, perLevel: 1 }, { stat: 'blockChance', perLevel: 0.0013 }, { stat: 'strength', perLevel: 0.3 }], 2],
  ['orb_glass', 'Orbe de cristal', 'orb', undefined, 'burst:#9ad0f5', [{ stat: 'spellPower', base: 2, perLevel: 0.8 }, { stat: 'intellect', perLevel: 0.25 }], 0],
  ['orb_ember', 'Orbe de ascuas', 'orb', undefined, 'burst:#f07a30', [{ stat: 'spellPower', base: 2, perLevel: 0.9 }, { stat: 'critChance', perLevel: 0.0004 }], 1],
  ['orb_void', 'Orbe del vacío', 'orb', undefined, 'burst:#9a5ad0', [{ stat: 'spellPower', base: 2, perLevel: 1 }, { stat: 'spirit', perLevel: 0.3 }], 2],
  ['quiver', 'Carcaj', 'quiver', 'offhand_quiver', 'arrow:#9a6a3a', [{ stat: 'attackPower', base: 1, perLevel: 0.6 }, { stat: 'agility', perLevel: 0.25 }], 1],
];
for (const [id, name, kind, look, icon, stats, tier] of OFFHAND) {
  const [minLevel, maxLevel] = tier === 1 ? [1, 30] : TIERS[tier]!;
  add(id, name, { slot: 'offhand', kind, minLevel, maxLevel, look, icon, stats });
}

/** Jewellery: no look; small stamina, the rest comes from random properties. */
const JEWELS: [string, string, Slot, string, number][] = [
  ['neck_copper', 'Amuleto de cobre', 'neck', 'star:#c08a4a', 0],
  ['neck_silver', 'Amuleto de plata', 'neck', 'star:#d0d8e0', 1],
  ['neck_gold', 'Amuleto de oro', 'neck', 'star:#e0c060', 2],
  ['ring_copper', 'Anillo de cobre', 'ring', 'spiral:#c08a4a', 0],
  ['ring_silver', 'Anillo de plata', 'ring', 'spiral:#d0d8e0', 1],
  ['ring_gold', 'Anillo de oro', 'ring', 'spiral:#e0c060', 2],
];
for (const [id, name, slot, icon, tier] of JEWELS) {
  const [minLevel, maxLevel] = TIERS[tier]!;
  add(id, name, { slot, kind: 'jewelry', minLevel, maxLevel, icon, stats: [{ stat: 'stamina', perLevel: 0.2 }] });
}

writeFileSync('data/items/bases.json', JSON.stringify(bases, null, 2) + '\n');
const esPath = 'data/i18n/es.json';
const es = JSON.parse(readFileSync(esPath, 'utf8')) as Record<string, string>;
for (const k of Object.keys(es)) if (k.startsWith('item.') && !k.startsWith('item.potion')) delete es[k];
Object.assign(es, names);
writeFileSync(esPath, JSON.stringify(es, null, 2) + '\n');
console.log(`${Object.keys(bases).length} item bases`);
