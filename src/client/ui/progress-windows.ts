import { ability, CLASSES, type Attributes } from '../../sim/combat/defs';
import { ATTR_KEYS, totalAttributes } from '../../sim/combat/stats';
import type { ProgressInfo, ProgressRequest } from '../../sim/progression/requests';
import { canSpend, TALENTS } from '../../sim/progression/talents';
import { SPECS, specsOf, UNLOCK } from '../../sim/progression/unlocks';
import { iconUrl } from '../hud/icons';
import { t } from '../i18n';
import { button, el } from './dom';
import { formatStat, talentTooltip } from './progress-logic';

export interface ProgressWindowsOptions {
  classId: string;
  request: (req: ProgressRequest) => void;
  /** True while the chat has focus: window keys are ignored. */
  isTyping: () => boolean;
  /** Equipment panel for the character window. */
  equipment?: () => HTMLElement;
}

type Which = 'character' | 'talents' | 'spec';

const SHOWN_STATS = [
  'maxHp', 'maxResource', 'attackPower', 'spellPower', 'critChance', 'critDamage', 'dodgeChance', 'blockChance',
  'armor', 'cooldownReduction', 'lifesteal', 'hpRegen', 'manaRegen', 'moveSpeed',
];

const abilityTitle = (id: string) => {
  const ab = ability(id);
  if (!ab) return id;
  const desc = t(`desc.${id}`);
  return desc.startsWith('desc.') ? t(ab.nameKey) : `${t(ab.nameKey)}\n${desc}`;
};

function abilityIcon(id: string | null, cls: string): HTMLElement {
  const box = el('div', cls);
  const ab = id ? ability(id) : undefined;
  if (ab) {
    const img = el('img', 'slot-icon');
    img.src = iconUrl(ab.icon);
    img.alt = '';
    box.append(img);
    box.title = abilityTitle(ab.id);
  }
  return box;
}

/**
 * Character (C), Talents (N) and Specialization windows. They only show the host's progress and send
 * requests; nothing changes locally until the host answers with a new progress message.
 */
export class ProgressWindows {
  private readonly root = el('div', 'game-window');
  private p: ProgressInfo | null = null;
  private open: Which | null = null;
  private picked: string | null = null;
  private specPrompted = false;
  private readonly onKey = (e: KeyboardEvent) => this.key(e);

  constructor(
    parent: HTMLElement,
    private readonly opts: ProgressWindowsOptions,
  ) {
    this.root.hidden = true;
    parent.append(this.root);
    document.addEventListener('keydown', this.onKey);
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }

  get current(): Which | null {
    return this.open;
  }

  update(p: ProgressInfo): void {
    const reached = (this.p?.level ?? 0) < UNLOCK.spec && p.level >= UNLOCK.spec;
    this.p = p;
    if (!p.specId && p.level >= UNLOCK.spec && (reached || !this.specPrompted) && this.open === null) {
      this.specPrompted = true;
      this.show('spec');
      return;
    }
    if (this.open) this.render();
  }

  /** Re-renders the open window (e.g. after the inventory changed). */
  refresh(): void {
    if (this.open) this.render();
  }

  toggle(which: Which): void {
    if (this.open === which) this.close();
    else this.show(which);
  }

  show(which: Which): void {
    this.open = which;
    this.picked = null;
    this.render();
    this.root.hidden = false;
  }

  close(): void {
    this.open = null;
    this.root.hidden = true;
  }

  private key(e: KeyboardEvent): void {
    if (this.opts.isTyping() || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (e.code === 'KeyC') this.toggle('character');
    else if (e.code === 'KeyN') this.toggle('talents');
    else if (e.code === 'Escape' && this.open) this.close();
    else return;
    e.preventDefault();
  }

  private render(): void {
    const p = this.p;
    this.root.replaceChildren();
    if (!p || !this.open) return;
    const head = el('div', 'win-head');
    const titleKey = this.open === 'character' ? 'character.title' : this.open === 'talents' ? 'talents.title' : 'spec.title';
    head.append(el('h2', 'win-title', t(titleKey)), button('btn small', '✕', () => this.close()));
    head.lastElementChild!.setAttribute('aria-label', t('window.close'));
    this.root.dataset.window = this.open;
    this.root.append(head);
    if (this.open === 'character') this.renderCharacter(p);
    else if (this.open === 'talents') this.renderTalents(p);
    else this.renderSpec(p);
    this.root.append(el('div', 'muted win-foot', t('window.keys')));
  }

  private renderCharacter(p: ProgressInfo): void {
    const c = CLASSES[this.opts.classId];
    const body = el('div', 'win-cols');
    // Attributes
    const attrs = el('section', 'win-section');
    attrs.append(el('h3', '', `${t(`class.${this.opts.classId}`)} · ${t('character.level', { level: p.level })}`));
    attrs.append(el('div', 'muted', t('character.freeAttrs', { n: p.freeAttrPoints })));
    const totals: Attributes | null = c ? totalAttributes(c, p.level, p.attributes) : null;
    for (const k of ATTR_KEYS) {
      const row = el('div', 'attr-row');
      row.dataset.attr = k;
      row.append(el('span', 'attr-name', t(`attr.${k}`)), el('span', 'attr-value', String(totals?.[k] ?? 0)));
      const plus = button('btn tiny', '+', () => this.opts.request({ k: 'attr', attr: k }));
      plus.disabled = p.freeAttrPoints <= 0;
      plus.dataset.plus = k;
      row.append(plus);
      attrs.append(row);
    }
    attrs.append(button('btn small', t('character.resetAttrs'), () => this.opts.request({ k: 'resetAttrs' })));
    // Stats
    const stats = el('section', 'win-section');
    stats.append(el('h3', '', t('character.stats')));
    for (const k of SHOWN_STATS) {
      if (!(k in p.stats)) continue;
      if (k === 'manaRegen' && c?.resource !== 'mana') continue;
      const row = el('div', 'stat-row');
      row.append(el('span', '', t(`stat.${k}`)), el('span', 'stat-value', formatStat(k, p.stats[k]!)));
      stats.append(row);
    }
    // Spec, abilities, passives
    const right = el('section', 'win-section');
    right.append(el('h3', '', t('character.spec')));
    const spec = p.specId ? SPECS[p.specId] : undefined;
    const specRow = el('div', 'attr-row');
    specRow.append(el('span', 'spec-name', spec ? t(spec.nameKey) : t('character.noSpec')));
    if (p.level >= UNLOCK.spec) specRow.append(button('btn small', spec ? t('character.changeSpec') : t('character.chooseSpec'), () => this.show('spec')));
    else specRow.append(el('span', 'muted', t('character.specAt')));
    right.append(specRow);

    right.append(el('h3', '', t('character.abilities')), el('div', 'muted', t('character.abilitiesHelp')));
    const pool = el('div', 'ability-pool');
    for (const id of p.unlocked) {
      const b = abilityIcon(id, this.picked === id ? 'slot pick on' : 'slot pick');
      b.dataset.ability = id;
      b.onclick = () => {
        this.picked = this.picked === id ? null : id;
        this.render();
      };
      pool.append(b);
    }
    right.append(pool);
    const bar = el('div', 'ability-pool');
    p.hotbar.forEach((id, i) => {
      const b = abilityIcon(id, id ? 'slot target' : 'slot target empty');
      b.dataset.hotbar = String(i);
      b.append(el('span', 'slot-key', String(i + 1)));
      b.title = `${t('character.slot', { n: i + 1 })}${id ? `\n${abilityTitle(id)}` : ''}`;
      b.onclick = () => {
        const chosen = this.picked;
        this.picked = null;
        if (chosen) this.opts.request({ k: 'hotbar', slot: i, abilityId: chosen });
        else if (id) this.opts.request({ k: 'hotbar', slot: i, abilityId: null });
        this.render();
      };
      bar.append(b);
    });
    right.append(bar);
    right.append(el('h3', '', t('character.passives')));
    const passives = [...(c?.passives ?? []), ...(spec?.passives ?? [])];
    for (const ps of passives) {
      const active = p.passives.includes(ps.id);
      const row = el('div', active ? 'passive-row' : 'passive-row locked', t(ps.nameKey));
      row.title = t(`desc.${ps.id}`);
      right.append(row);
    }
    body.append(attrs, stats, right);
    this.root.append(body);
    const eq = this.opts.equipment?.();
    if (eq) this.root.append(el('h3', 'win-sub', t('inventory.equipment')), eq, el('div', 'muted', t('inventory.unequipHelp')));
  }

  private renderTalents(p: ProgressInfo): void {
    this.root.append(el('div', 'muted', t('talents.free', { n: p.freeTalentPoints })));
    const NS = 'http://www.w3.org/2000/svg';
    const W = 640;
    const H = 540;
    const S = 230;
    const pos = (x: number, y: number) => ({ x: W / 2 + x * S, y: H / 2 + y * S });
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'talent-circle');
    const mk = (tag: string, attrs: Record<string, string | number>, cls?: string) => {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      if (cls) e.setAttribute('class', cls);
      return e;
    };
    const owned = (id: string) => id === TALENTS.start || (p.talents[id] ?? 0) > 0;
    // Links first, so nodes are drawn on top.
    for (const [id, n] of Object.entries(TALENTS.nodes)) {
      for (const l of n.links) {
        if (l < id) continue;
        const a = pos(n.x, n.y);
        const b = pos(TALENTS.nodes[l]!.x, TALENTS.nodes[l]!.y);
        svg.append(mk('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, owned(id) && owned(l) ? 'talent-link lit' : 'talent-link'));
      }
    }
    const R = { start: 13, minor: 8, notable: 11, keystone: 15 };
    for (const [id, n] of Object.entries(TALENTS.nodes)) {
      const c = pos(n.x, n.y);
      const can = canSpend(p.talents, id, p.level);
      const state = owned(id) ? 'owned' : can ? 'can' : 'locked';
      const g = mk('g', { 'data-talent': id }, `talent-node ${n.kind} ${state}`);
      const title = mk('title', {});
      title.textContent = talentTooltip(id);
      g.append(title, mk('circle', { cx: c.x, cy: c.y, r: R[n.kind] }));
      if (can) g.addEventListener('click', () => this.opts.request({ k: 'talent', node: id }));
      svg.append(g);
    }
    for (const d of TALENTS.directions) {
      const k = TALENTS.nodes[`${d}_key`];
      if (!k) continue;
      const len = Math.hypot(k.x, k.y) || 1;
      const c = pos((k.x / len) * 1.08, (k.y / len) * 1.08);
      const label = mk('text', { x: c.x, y: c.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, 'talent-dir');
      label.textContent = t(`route.${d}`);
      svg.append(label);
    }
    this.root.append(svg, el('div', 'muted', t('talents.help')), button('btn small', t('talents.reset'), () => this.opts.request({ k: 'resetTalents' })));
  }

  private renderSpec(p: ProgressInfo): void {
    const cards = el('div', 'win-cols');
    for (const s of specsOf(this.opts.classId)) {
      const card = el('section', p.specId === s.id ? 'win-section spec-card on' : 'win-section spec-card');
      card.dataset.spec = s.id;
      card.append(el('h3', '', t(s.nameKey)), el('div', 'muted', t(s.descKey)));
      const icons = el('div', 'ability-pool');
      for (const id of [...Object.values(s.replaces ?? {}), ...s.actives]) icons.append(abilityIcon(id, 'slot'));
      card.append(icons);
      for (const ps of s.passives) {
        const row = el('div', 'passive-row', t(ps.nameKey));
        row.title = t(`desc.${ps.id}`);
        card.append(row);
      }
      if (p.specId === s.id) card.append(el('div', 'muted', t('spec.current')));
      else
        card.append(
          button('btn primary small', t('spec.choose', { name: t(s.nameKey) }), () => {
            this.opts.request({ k: 'spec', specId: s.id });
            this.close();
          }),
        );
      cards.append(card);
    }
    this.root.append(cards, button('btn small', t('spec.later'), () => this.close()));
  }
}
