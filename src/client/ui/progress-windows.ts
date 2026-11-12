import { ability, CLASSES, type Attributes } from '../../sim/combat/defs';
import { ATTR_KEYS, totalAttributes } from '../../sim/combat/stats';
import type { ProgressInfo, ProgressRequest } from '../../sim/progression/requests';
import { canSpend, TALENTS } from '../../sim/progression/talents';
import { SPECS, specsOf, UNLOCK } from '../../sim/progression/unlocks';
import { iconUrl } from '../hud/icons';
import { t } from '../i18n';
import { button, el } from './dom';
import { formatStat, talentLayout, talentTooltip } from './progress-logic';

export interface ProgressWindowsOptions {
  classId: string;
  request: (req: ProgressRequest) => void;
  /** True while the chat has focus: window keys are ignored. */
  isTyping: () => boolean;
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
  }

  private renderTalents(p: ProgressInfo): void {
    this.root.append(el('div', 'muted', t('talents.free', { n: p.freeTalentPoints })));
    const grid = el('div', 'talent-grid');
    for (const col of talentLayout()) {
      const c = el('div', 'talent-col');
      c.append(el('div', 'talent-route', t(`route.${col.route}`)));
      for (const tier of col.tiers) {
        const row = el('div', 'talent-tier');
        for (const id of tier) row.append(this.talentNode(p, id));
        c.append(row);
      }
      grid.append(c);
    }
    this.root.append(grid);
    this.root.append(el('div', 'muted', t('talents.bridges')));
    const bridges = el('div', 'talent-tier bridges');
    for (const id of Object.keys(TALENTS.bridges)) bridges.append(this.talentNode(p, id));
    this.root.append(bridges, button('btn small', t('talents.reset'), () => this.opts.request({ k: 'resetTalents' })));
  }

  private talentNode(p: ProgressInfo, id: string): HTMLElement {
    const def = TALENTS.nodes[id] ?? TALENTS.bridges[id]!;
    const rank = p.talents[id] ?? 0;
    const can = canSpend(p.talents, id, p.level);
    const cls = ['talent-node', rank >= def.maxRank ? 'full' : '', rank > 0 ? 'some' : '', can ? 'can' : 'locked'].filter(Boolean).join(' ');
    const b = button(cls, `${rank}/${def.maxRank}`, () => can && this.opts.request({ k: 'talent', node: id }));
    b.dataset.talent = id;
    b.title = talentTooltip(id);
    b.prepend(el('span', 'talent-name', t(`talent.${id}`)));
    return b;
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
