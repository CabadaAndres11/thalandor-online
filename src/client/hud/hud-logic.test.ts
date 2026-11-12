import { ABILITIES, CLASSES } from '../../sim/combat/defs';
import { cooldownView, floatingText, hotbarFor, parseIcon } from './hud-logic';

test('parseIcon splits glyph and colour and rejects bad specs', () => {
  expect(parseIcon('sword:#9aa3ad')).toEqual({ glyph: 'sword', color: '#9aa3ad' });
  expect(parseIcon('nope')).toEqual({ glyph: 'star', color: '#888888' });
  expect(parseIcon('sword:red')).toEqual({ glyph: 'sword', color: '#888888' });
});

test('every ability icon parses to a known glyph', () => {
  for (const a of Object.values(ABILITIES)) expect(parseIcon(a.icon).color).not.toBe('#888888');
});

test('cooldownView: fraction left and a short label', () => {
  expect(cooldownView(0, 3000)).toEqual({ fraction: 0, label: '' });
  expect(cooldownView(1500, 3000)).toEqual({ fraction: 0.5, label: '1.5' });
  expect(cooldownView(4200, 12000)).toEqual({ fraction: 0.35, label: '5' });
  expect(cooldownView(100, 0)).toEqual({ fraction: 0, label: '' });
});

test('hotbarFor lists LMB, RMB, 1-4 and Space with keys, abilities and costs', () => {
  const bar = hotbarFor('warrior');
  expect(bar.map((s) => s.key)).toEqual(['CI', 'CD', '1', '2', '3', '4', '␣']);
  expect(bar[0]).toMatchObject({ slot: 'lmb', abilityId: CLASSES.warrior!.slots.lmb, cost: 0 });
  expect(bar[3]).toMatchObject({ slot: 's2', abilityId: 'warrior_battle_shout', cost: 10 });
  expect(bar[5]).toMatchObject({ slot: 's4', abilityId: null });
  expect(bar[6]).toMatchObject({ slot: 'dodge', abilityId: 'dodge' });
});

test('floatingText formats damage, crits, heals and dodges', () => {
  expect(floatingText({ amount: 12, crit: false, dodged: false, heal: false, absorbed: 0 })).toEqual({ text: '12', kind: 'damage' });
  expect(floatingText({ amount: 30, crit: true, dodged: false, heal: false, absorbed: 0 })).toEqual({ text: '30!', kind: 'crit' });
  expect(floatingText({ amount: 9, crit: false, dodged: false, heal: true, absorbed: 0 })).toEqual({ text: '+9', kind: 'heal' });
  expect(floatingText({ amount: 0, crit: false, dodged: true, heal: false, absorbed: 0 })).toEqual({ text: 'hud.dodged', kind: 'miss' });
  expect(floatingText({ amount: 0, crit: false, dodged: false, heal: false, absorbed: 10 })).toEqual({ text: 'hud.absorbed', kind: 'miss' });
  expect(floatingText({ amount: 0, crit: false, dodged: false, heal: true, absorbed: 0 })).toBeNull();
});
