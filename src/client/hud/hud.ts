import type { MeSnapshot } from '../../sim/world';
import type { ProgressInfo } from '../../sim/progression/requests';
import type { RenderState } from '../client-session';
import { t } from '../i18n';
import { el } from '../ui/dom';
import { cooldownView, hotbarFor, xpView, type HotbarSlot } from './hud-logic';
import { iconUrl } from './icons';

const RESOURCE_COLORS: Record<string, string> = { rage: '#c0392b', mana: '#2e6fd8', energy: '#e0b52f', none: '#555' };
const REVIVE_RANGE = 48;
const MAX_COMBO = 5;

interface SlotEl {
  def: HotbarSlot;
  root: HTMLElement;
  sweep: HTMLElement;
  label: HTMLElement;
}

/**
 * In-game combat HUD (DOM): health/resource bars, combo points, square ability slots with icons,
 * experience bar with the level, channel bar and downed/revive prompts.
 */
export class Hud {
  private readonly root = el('div', 'combat-hud');
  private readonly hpFill = el('div', 'bar-fill hp');
  private readonly hpText = el('span', 'bar-text');
  private readonly resFill = el('div', 'bar-fill');
  private readonly resText = el('span', 'bar-text');
  private readonly combo = el('div', 'combo');
  private readonly bar = el('div', 'hotbar');
  private readonly xp = el('div', 'xp-bar');
  private readonly xpFill = el('div', 'xp-fill');
  private readonly xpText = el('span', 'bar-text');
  private readonly level = el('span', 'level-badge');
  private readonly channel = el('div', 'channel-bar');
  private readonly channelFill = el('div', 'channel-fill');
  private readonly banner = el('div', 'hud-banner');
  private readonly prompt = el('div', 'hud-prompt');
  private slots: SlotEl[] = [];
  private classId = '';
  private loadoutKey = '';
  private comboVisible = false;

  constructor(parent: HTMLElement) {
    const hp = el('div', 'bar');
    hp.append(this.hpFill, this.hpText);
    const res = el('div', 'bar');
    res.append(this.resFill, this.resText);
    const bars = el('div', 'bars');
    bars.append(hp, res);
    for (let i = 0; i < MAX_COMBO; i++) this.combo.append(el('span', 'combo-pip'));
    this.combo.hidden = true;
    this.xp.append(this.xpFill, this.xpText);
    const xpRow = el('div', 'xp-row');
    xpRow.append(this.level, this.xp);
    this.channel.append(this.channelFill);
    this.channel.hidden = true;
    this.root.append(this.banner, this.prompt, this.channel, this.combo, bars, this.bar, xpRow);
    this.root.hidden = true;
    parent.append(this.root);
  }

  show(classId: string): void {
    this.classId = classId;
    this.loadoutKey = '';
    this.comboVisible = false;
    this.renderSlots(hotbarFor(classId));
    this.level.textContent = '1';
    this.xpFill.style.width = '0%';
    this.xpText.textContent = '';
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Applies the host's progress: what each slot casts, level, experience, combo visibility. */
  setProgress(p: ProgressInfo): void {
    const key = JSON.stringify(p.slots);
    if (key !== this.loadoutKey) {
      this.loadoutKey = key;
      this.renderSlots(hotbarFor(this.classId, p.slots));
    }
    const v = xpView(p);
    this.level.textContent = String(p.level);
    this.level.title = t('hud.level', { level: p.level });
    this.xpFill.style.width = `${v.fraction * 100}%`;
    this.xpText.textContent = p.xpToNext > 0 ? v.label : t('hud.maxLevel');
    this.comboVisible = p.specId === 'explorer_assassin';
  }

  private renderSlots(defs: HotbarSlot[]): void {
    this.bar.replaceChildren();
    this.slots = defs.map((def) => {
      const root = el('div', def.abilityId ? 'slot' : 'slot empty');
      root.dataset.slot = def.slot;
      if (def.abilityId) root.dataset.ability = def.abilityId;
      if (def.icon) {
        const img = el('img', 'slot-icon');
        img.src = iconUrl(def.icon);
        img.alt = '';
        root.append(img);
        root.title = def.nameKey ? t(def.nameKey) : '';
      }
      const sweep = el('div', 'slot-sweep');
      const label = el('span', 'slot-cd');
      root.append(sweep, label, el('span', 'slot-key', def.key));
      if (def.cost > 0) root.append(el('span', 'slot-cost', String(def.cost)));
      this.bar.append(root);
      return { def, root, sweep, label };
    });
  }

  update(rs: RenderState, me: MeSnapshot | null): void {
    const self = rs.self;
    if (!self) return;
    const hpPct = self.maxHp > 0 ? Math.max(0, self.hp / self.maxHp) : 0;
    this.hpFill.style.width = `${hpPct * 100}%`;
    this.hpText.textContent = `${Math.ceil(self.hp)} / ${Math.round(self.maxHp)}`;
    if (me) {
      this.resFill.style.width = `${me.maxResource > 0 ? (me.resource / me.maxResource) * 100 : 0}%`;
      this.resFill.style.background = RESOURCE_COLORS[me.resourceKind] ?? '#555';
      this.resText.textContent = `${Math.floor(me.resource)} / ${Math.round(me.maxResource)}`;
      for (const s of this.slots) {
        if (!s.def.abilityId) continue;
        const cd = me.cd[s.def.slot] ?? 0;
        const view = cooldownView(cd, s.def.cooldownMs);
        s.sweep.style.setProperty('--cd', String(view.fraction));
        s.label.textContent = view.label;
        s.root.classList.toggle('nores', me.resource < s.def.cost);
        s.root.classList.toggle('cooling', view.fraction > 0);
      }
      this.combo.hidden = !this.comboVisible;
      [...this.combo.children].forEach((pip, i) => pip.classList.toggle('on', i < me.combo));
      const ch = me.channel;
      this.channel.hidden = !ch || ch.total <= 0;
      if (ch && ch.total > 0) this.channelFill.style.width = `${(1 - ch.ms / ch.total) * 100}%`;
    }
    if (self.state === 'downed') {
      this.banner.textContent = t('hud.downed', { s: Math.ceil((me?.downedMs ?? 0) / 1000) });
      this.banner.hidden = false;
    } else if (self.state === 'dead') {
      this.banner.textContent = t('hud.respawning', { s: Math.ceil((me?.respawnMs ?? 0) / 1000) });
      this.banner.hidden = false;
    } else this.banner.hidden = true;
    const downedAlly =
      self.state === 'alive' &&
      [...rs.others.values()].some((o) => o.kind === 'player' && o.state === 'downed' && Math.hypot(o.pos.x - self.pos.x, o.pos.y - self.pos.y) <= REVIVE_RANGE + 12);
    if (me?.reviving) {
      this.prompt.textContent = t('hud.reviving', { pct: Math.round(me.reviving.pct * 100) });
      this.prompt.hidden = false;
    } else if (downedAlly) {
      this.prompt.textContent = t('hud.revivePrompt');
      this.prompt.hidden = false;
    } else this.prompt.hidden = true;
  }

  /** Brief highlight when a slot key is pressed. */
  flash(slot: string): void {
    const s = this.slots.find((x) => x.def.slot === slot);
    if (!s) return;
    s.root.classList.remove('pressed');
    void s.root.offsetWidth;
    s.root.classList.add('pressed');
  }
}
