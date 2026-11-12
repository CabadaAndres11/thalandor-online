/**
 * Generates data/talents.json (circular talent tree, GDD annex C) and the talent names in
 * data/i18n/es.json. Usage: npx tsx tools/gen-talents.ts
 *
 * Shape: a free start node in the centre; 10 spokes (5 pure directions alternating with
 * 5 hybrids between neighbours) of 4 nodes each; the 1st and 3rd steps are also linked
 * sideways into rings; the 3rd node of every spoke is a notable; pure spokes end in a keystone.
 */
import { readFileSync, writeFileSync } from 'node:fs';

type Mod = { stat: string; pct?: number; flat?: number };
const P = (stat: string, pct: number): Mod => ({ stat, pct });
const F = (stat: string, flat: number): Mod => ({ stat, flat });

/** Circular order (clockwise from the top): neighbours share a hybrid spoke. */
const DIRS = ['might', 'celerity', 'vitality', 'bastion', 'arcane'] as const;
type Dir = (typeof DIRS)[number];

const DIR_NAMES: Record<Dir, string> = { might: 'Poderío', celerity: 'Celeridad', vitality: 'Vitalidad', bastion: 'Bastión', arcane: 'Arcano' };

/** Per direction: steps 1–4 (step 3 is the notable) and the keystone. */
const STEPS: Record<Dir, { names: [string, string, string, string, string]; mods: [Mod[], Mod[], Mod[], Mod[], Mod[]] }> = {
  might: {
    names: ['Fuerza bruta', 'Precisión', 'Golpes certeros', 'Brutalidad', 'Maestría marcial'],
    mods: [[P('attackPower', 0.03)], [F('critChance', 0.01)], [P('attackPower', 0.04), F('critDamage', 0.05)], [P('damageDone', 0.02)], [P('attackPower', 0.08), F('critDamage', 0.1)]],
  },
  celerity: {
    names: ['Paso ligero', 'Reflejos felinos', 'Ritmo', 'Presteza', 'Torbellino del tiempo'],
    mods: [[P('moveSpeed', 0.03)], [F('dodgeChance', 0.01)], [F('cooldownReduction', 0.03), P('moveSpeed', 0.03)], [F('cooldownReduction', 0.02)], [F('cooldownReduction', 0.08)]],
  },
  vitality: {
    names: ['Regeneración', 'Manos sanadoras', 'Sed vital', 'Receptividad', 'Fuente de vida'],
    mods: [[F('hpRegen', 1)], [P('healingDone', 0.03)], [F('lifesteal', 0.01), P('healingReceived', 0.04)], [P('healingReceived', 0.03)], [P('healingReceived', 0.08), F('lifesteal', 0.02)]],
  },
  bastion: {
    names: ['Coraza', 'Robustez', 'Escudo firme', 'Muralla', 'Inquebrantable'],
    mods: [[P('armor', 0.04)], [P('maxHp', 0.03)], [F('blockChance', 0.02), P('damageTaken', -0.02)], [F('armor', 15)], [P('maxHp', 0.08), P('damageTaken', -0.03)]],
  },
  arcane: {
    names: ['Poder arcano', 'Reserva', 'Agudeza', 'Flujo', 'Archimago'],
    mods: [[P('spellPower', 0.03)], [P('maxResource', 0.04)], [F('critDamage', 0.05), P('spellPower', 0.04)], [P('manaRegen', 0.05)], [P('spellPower', 0.08)]],
  },
};

const ROMAN = ['I', 'II', 'III', 'IV'];
const RADIUS = [0.17, 0.34, 0.51, 0.68, 0.86];
const round = (x: number) => Math.round(x * 1000) / 1000;
const scale = (m: Mod, k: number): Mod => (m.pct !== undefined ? P(m.stat, round(m.pct * k)) : F(m.stat, round((m.flat ?? 0) * k)));

interface Node {
  kind: 'start' | 'minor' | 'notable' | 'keystone';
  dir: string;
  x: number;
  y: number;
  mods: Mod[];
  links: string[];
}
const nodes: Record<string, Node> = { start: { kind: 'start', dir: 'start', x: 0, y: 0, mods: [], links: [] } };
const names: Record<string, string> = { 'talent.start': 'Origen' };
const link = (a: string, b: string) => {
  nodes[a]!.links.push(b);
  nodes[b]!.links.push(a);
};

const spokes: string[] = [];
for (let i = 0; i < 10; i++) {
  const angle = ((-90 + 36 * i) * Math.PI) / 180;
  const pure = i % 2 === 0;
  const a = DIRS[Math.floor(i / 2)]!;
  const b = DIRS[(Math.floor(i / 2) + 1) % DIRS.length]!;
  const spoke = pure ? a : `${a}_${b}`;
  spokes.push(spoke);
  for (let step = 1; step <= 4; step++) {
    const id = `${spoke}_${step}`;
    const notable = step === 3;
    // A hybrid node gives the main bonus of both directions: 60 % of each, full for notables.
    const mods = pure ? STEPS[a].mods[step - 1]! : [scale(STEPS[a].mods[step - 1]![0]!, notable ? 1 : 0.6), scale(STEPS[b].mods[step - 1]![0]!, notable ? 1 : 0.6)];
    nodes[id] = { kind: notable ? 'notable' : 'minor', dir: spoke, x: round(Math.cos(angle) * RADIUS[step - 1]!), y: round(Math.sin(angle) * RADIUS[step - 1]!), mods, links: [] };
    names[`talent.${id}`] = pure ? STEPS[a].names[step - 1]! : `${DIR_NAMES[a]}–${DIR_NAMES[b]} ${ROMAN[step - 1]}`;
    link(step === 1 ? 'start' : `${spoke}_${step - 1}`, id);
  }
  if (pure) {
    const id = `${a}_key`;
    nodes[id] = { kind: 'keystone', dir: a, x: round(Math.cos(angle) * RADIUS[4]!), y: round(Math.sin(angle) * RADIUS[4]!), mods: STEPS[a].mods[4]!, links: [] };
    names[`talent.${id}`] = STEPS[a].names[4]!;
    link(`${a}_4`, id);
  }
}
// Rings: the 1st and 3rd steps of neighbouring spokes are linked.
for (let i = 0; i < 10; i++) {
  const s = spokes[i]!;
  const n = spokes[(i + 1) % 10]!;
  link(`${s}_1`, `${n}_1`);
  link(`${s}_3`, `${n}_3`);
}

writeFileSync('data/talents.json', JSON.stringify({ start: 'start', directions: DIRS, nodes }, null, 2) + '\n');
const esPath = 'data/i18n/es.json';
const es = JSON.parse(readFileSync(esPath, 'utf8')) as Record<string, string>;
for (const k of Object.keys(es)) if (k.startsWith('talent.')) delete es[k];
Object.assign(es, names);
writeFileSync(esPath, JSON.stringify(es, null, 2) + '\n');
console.log(`${Object.keys(nodes).length} nodes`);
