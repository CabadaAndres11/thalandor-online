/**
 * Equipment looks for tools/lpc-selection.json ("gear" section). Usage: npx tsx tools/gear-looks.ts
 * Each look is one visible piece (LPC sheets + colour) that an item base can point to.
 * Sheets drawn in the steel ramp are recoloured with the metal palette; cloth ones with the cloth palette.
 */
import { readFileSync, writeFileSync } from 'node:fs';

type Slot = 'weapon' | 'offhand' | 'head' | 'shoulders' | 'chest' | 'hands' | 'legs' | 'feet';
interface SelLayer {
  src: string;
  z: number;
  cloth?: string;
  metal?: string;
  anims?: Record<string, string>;
  actionOnly?: boolean;
}
interface GearLook {
  slot: Slot;
  bodies: Record<'male' | 'female', SelLayer[]>;
}

const looks: Record<string, GearLook> = {};
/** Same layers for both bodies with `{b}` replaced by each body's folder. */
const both = (slot: Slot, fn: (b: string) => SelLayer[], folders: [string, string] = ['male', 'female']) => ({
  slot,
  bodies: { male: fn(folders[0]), female: fn(folders[1]) },
});
const add = (id: string, look: GearLook) => {
  looks[id] = look;
};

const METALS = ['iron', 'steel', 'bronze', 'gold', 'silver'];
const CLOTHS: Record<string, string> = { brown: 'brown', gray: 'gray', navy: 'navy', maroon: 'maroon', forest: 'forest', purple: 'purple', black: 'black', white: 'white' };

// --- Head (z 130, over hair 120) ---
for (const m of METALS) {
  add(`head_mail_${m}`, both('head', () => [{ src: 'hat/helmet/mail/adult/walk.png', z: 130, metal: m }]));
  add(`head_nasal_${m}`, both('head', () => [{ src: 'hat/helmet/nasal/adult/walk.png', z: 130, metal: m }]));
  add(`head_kettle_${m}`, both('head', () => [{ src: 'hat/helmet/kettle/adult/walk.png', z: 130, metal: m }]));
  add(`head_barbuta_${m}`, both('head', (b) => [{ src: `hat/helmet/barbuta/${b}/walk.png`, z: 130, metal: m }]));
  add(`head_greathelm_${m}`, both('head', (b) => [{ src: `hat/helmet/greathelm/${b}/walk.png`, z: 130, metal: m }]));
  add(`head_horned_${m}`, both('head', () => [{ src: 'hat/helmet/horned/adult/walk.png', z: 130, metal: m }]));
}
for (const c of ['brown', 'gray', 'navy', 'forest', 'black', 'maroon']) {
  add(`head_hood_${c}`, both('head', () => [{ src: 'hat/cloth/hood/adult/walk.png', z: 130, cloth: CLOTHS[c] }]));
  add(`head_cap_${c}`, both('head', () => [{ src: `hat/cloth/leather_cap/adult/walk/${c}.png`, z: 130 }]));
}
for (const c of ['blue', 'black', 'brown', 'forest', 'charcoal']) add(`head_wizard_${c}`, both('head', () => [{ src: `hat/magic/wizard/base/adult/walk/${c}.png`, z: 130 }]));

// --- Shoulders (z 65) ---
for (const c of ['white', 'gray', 'brown', 'black', 'maroon']) add(`shoulders_pauldrons_${c}`, both('shoulders', (b) => [{ src: `shoulders/pauldrons/${b}/walk.png`, z: 65, cloth: c }], ['male', 'thin']));
for (const m of ['bronze', 'iron', 'gold', 'silver', 'steel']) add(`shoulders_legion_${m}`, both('shoulders', (b) => [{ src: `shoulders/legion/${b}/walk/${m}.png`, z: 65 }]));
for (const c of ['purple', 'navy', 'maroon', 'forest', 'white']) add(`shoulders_mantal_${c}`, both('shoulders', (b) => [{ src: `shoulders/mantal/${b}/walk.png`, z: 65, cloth: c }], ['male', 'thin']));

// --- Chest ---
for (const m of METALS) {
  add(`chest_plate_${m}`, both('chest', (b) => [{ src: `torso/armour/plate/${b}/walk.png`, z: 60, metal: m }]));
  add(`chest_mail_${m}`, both('chest', (b) => [{ src: `torso/chainmail/${b}/walk.png`, z: 50, metal: m }]));
}
add('chest_leather', both('chest', (b) => [{ src: `torso/armour/leather/${b}/walk.png`, z: 60 }]));
for (const c of ['white', 'purple', 'navy', 'maroon', 'forest', 'gray', 'black', 'brown']) {
  add(`chest_shirt_${c}`, both('chest', (b) => [{ src: `torso/clothes/longsleeve/longsleeve/${b}/walk.png`, z: 35, cloth: c }]));
}
for (const c of ['black', 'blue', 'brown', 'purple', 'red', 'white', 'forest_green', 'light_gray']) {
  // The robe only exists for the female body; the male body wears the shirt in a similar colour.
  const shirt = { black: 'black', blue: 'navy', brown: 'brown', purple: 'purple', red: 'maroon', white: 'white', forest_green: 'forest', light_gray: 'gray' }[c]!;
  add(`chest_robe_${c}`, {
    slot: 'chest',
    bodies: {
      male: [{ src: 'torso/clothes/longsleeve/longsleeve/male/walk.png', z: 35, cloth: shirt }],
      female: [{ src: `torso/clothes/robe/female/walk/${c}.png`, z: 35 }],
    },
  });
}

// --- Hands (z 70) ---
for (const m of METALS) {
  add(`hands_gloves_${m}`, both('hands', (b) => [{ src: `arms/hands/gloves/${b}/walk.png`, z: 70, metal: m }], ['male', 'thin']));
  add(`hands_gauntlets_${m}`, both('hands', (b) => [{ src: `arms/armour/plate/${b}/walk.png`, z: 70, metal: m }], ['male', 'thin']));
}
add('hands_bracers', both('hands', (b) => [{ src: `arms/bracers/${b}/walk.png`, z: 70 }], ['male', 'thin']));

// --- Legs (z 20) ---
for (const c of ['brown', 'gray', 'navy', 'maroon', 'forest', 'black', 'white', 'purple', 'leather']) {
  add(`legs_pants_${c}`, both('legs', (b) => [{ src: `legs/pants/${b}/walk.png`, z: 20, cloth: c }], ['male', 'thin']));
  add(`legs_leggings_${c}`, both('legs', (b) => [{ src: `legs/leggings/${b}/walk.png`, z: 20, cloth: c }], ['male', 'thin']));
}
for (const m of METALS) add(`legs_plate_${m}`, both('legs', (b) => [{ src: `legs/armour/plate/${b}/walk.png`, z: 20, metal: m }], ['male', 'thin']));

// --- Feet ---
add('feet_shoes', both('feet', (b) => [{ src: `feet/shoes/basic/${b}/walk.png`, z: 15 }], ['male', 'thin']));
add('feet_boots', both('feet', (b) => [{ src: `feet/boots/basic/${b}/walk.png`, z: 25 }], ['male', 'thin']));
for (const c of ['brown', 'black', 'gray', 'maroon', 'leather']) {
  add(`feet_fold_${c}`, both('feet', (b) => [{ src: `feet/boots/fold/${b}/walk.png`, z: 25, cloth: c }], ['male', 'thin']));
  add(`feet_rimmed_${c}`, both('feet', (b) => [{ src: `feet/boots/rimmed/${b}/walk.png`, z: 25, cloth: c }], ['male', 'thin']));
}
for (const m of METALS) add(`feet_plate_${m}`, both('feet', (b) => [{ src: `feet/armour/plate/${b}/walk.png`, z: 25, metal: m }], ['male', 'thin']));

// --- Weapons (behind the body at z 9, in front at z 140) ---
const pair = (bg: SelLayer, fg: SelLayer) => both('weapon', () => [bg, fg]);
for (const v of ['steel', 'iron', 'gold', 'bronze', 'silver', 'copper']) {
  add(
    `weapon_arming_${v}`,
    pair(
      { src: `weapon/sword/arming/universal/bg/walk/${v}.png`, z: 9, anims: { slash: `weapon/sword/arming/attack_slash/bg/${v}.png` } },
      { src: `weapon/sword/arming/universal/fg/walk/${v}.png`, z: 140, anims: { slash: `weapon/sword/arming/attack_slash/fg/${v}.png` } },
    ),
  );
}
add(
  'weapon_longsword',
  pair(
    { src: 'weapon/sword/longsword/universal_behind/walk/longsword.png', z: 9, anims: { slash: 'weapon/sword/longsword/attack_slash/behind/longsword.png' } },
    { src: 'weapon/sword/longsword/walk/longsword.png', z: 140, anims: { slash: 'weapon/sword/longsword/attack_slash/longsword.png' } },
  ),
);
add(
  'weapon_saber',
  pair(
    { src: 'weapon/sword/saber/universal_behind/walk/saber.png', z: 9, anims: { slash: 'weapon/sword/saber/attack_slash/behind/saber.png' } },
    { src: 'weapon/sword/saber/walk/saber.png', z: 140, anims: { slash: 'weapon/sword/saber/attack_slash/saber.png' } },
  ),
);
add(
  'weapon_waraxe',
  pair(
    { src: 'weapon/blunt/waraxe/behind/walk/waraxe.png', z: 9, anims: { slash: 'weapon/blunt/waraxe/attack_slash/behind/waraxe.png' } },
    { src: 'weapon/blunt/waraxe/walk/waraxe.png', z: 140, anims: { slash: 'weapon/blunt/waraxe/attack_slash/waraxe.png' } },
  ),
);
add('weapon_mace', pair({ src: 'weapon/blunt/mace/universal_behind/walk/mace.png', z: 9 }, { src: 'weapon/blunt/mace/walk/mace.png', z: 140 }));
add(
  'weapon_flail',
  pair(
    { src: 'weapon/blunt/flail/behind/walk/flail.png', z: 9, anims: { slash: 'weapon/blunt/flail/attack_slash/behind/flail.png' } },
    { src: 'weapon/blunt/flail/walk/flail.png', z: 140, anims: { slash: 'weapon/blunt/flail/attack_slash/flail.png' } },
  ),
);
add(
  'weapon_dagger',
  pair(
    { src: 'weapon/sword/dagger/behind/walk/dagger.png', z: 9, anims: { slash: 'weapon/sword/dagger/behind/slash/dagger.png' } },
    { src: 'weapon/sword/dagger/walk/dagger.png', z: 140, anims: { slash: 'weapon/sword/dagger/slash/dagger.png', thrust: 'weapon/sword/dagger/thrust/dagger.png' } },
  ),
);
add('weapon_staff_simple', pair({ src: 'weapon/magic/simple/background/walk/simple.png', z: 9 }, { src: 'weapon/magic/simple/foreground/walk/simple.png', z: 140 }));
for (const v of ['blue', 'green', 'purple', 'red', 'orange']) {
  add(
    `weapon_staff_crystal_${v}`,
    pair(
      { src: `weapon/magic/crystal/universal/background/walk/${v}.png`, z: 9, anims: { thrust: `weapon/magic/crystal/thrust/background/${v}.png` } },
      { src: `weapon/magic/crystal/universal/foreground/walk/${v}.png`, z: 140, anims: { thrust: `weapon/magic/crystal/thrust/foreground/${v}.png` } },
    ),
  );
}
for (const v of ['light', 'medium', 'dark']) {
  add(
    `weapon_staff_gnarled_${v}`,
    pair(
      { src: `weapon/magic/gnarled/universal/background/walk/${v}.png`, z: 9, anims: { thrust: `weapon/magic/gnarled/thrust/background/${v}.png` } },
      { src: `weapon/magic/gnarled/universal/foreground/walk/${v}.png`, z: 140, anims: { thrust: `weapon/magic/gnarled/thrust/foreground/${v}.png` } },
    ),
  );
}
for (const v of ['light', 'medium', 'dark']) {
  const bow = (part: 'background' | 'foreground', z: number): SelLayer => ({
    src: `weapon/ranged/bow/normal/universal/${part}/shoot/${v}.png`,
    z,
    actionOnly: true,
    anims: { shoot: `weapon/ranged/bow/normal/universal/${part}/shoot/${v}.png` },
  });
  add(`weapon_bow_${v}`, pair(bow('background', -1), bow('foreground', 141)));
  const rec = (part: 'background' | 'foreground', z: number): SelLayer => ({
    src: `weapon/ranged/bow/recurve/universal/${part}/shoot/${v}.png`,
    z,
    actionOnly: true,
    anims: { shoot: `weapon/ranged/bow/recurve/universal/${part}/shoot/${v}.png` },
  });
  add(`weapon_recurve_${v}`, pair(rec('background', -1), rec('foreground', 141)));
}

// --- Off-hand ---
for (const v of ['brown', 'black', 'gold', 'green', 'silver']) add(`offhand_round_${v}`, both('offhand', () => [{ src: `shield/round/walk/${v}.png`, z: 110 }]));
for (const v of ['kite_gray', 'kite_blue_gray', 'kite_red_gray', 'kite_green_gray', 'kite_orange']) {
  add(`offhand_${v}`, both('offhand', (b) => [{ src: `shield/kite/${b}/walk/${v}.png`, z: 110 }]));
}
add('offhand_spartan', both('offhand', () => [{ src: 'shield/spartan/bg/walk/spartan.png', z: 9 }, { src: 'shield/spartan/fg/walk/spartan.png', z: 110 }]));
add('offhand_quiver', both('offhand', () => [{ src: 'quiver/walk/quiver.png', z: 8 }]));

const path = 'tools/lpc-selection.json';
const sel = JSON.parse(readFileSync(path, 'utf8'));
sel.gear = looks;
writeFileSync(path, JSON.stringify(sel, null, 2) + '\n');
console.log(`${Object.keys(looks).length} gear looks`);
