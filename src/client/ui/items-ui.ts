import { EQUIP_SLOTS, isPotion, itemBase, LOOT, sellPrice, type EquipSlot, type Item } from '../../sim/items/defs';
import type { InventoryInfo, ProgressRequest } from '../../sim/progression/requests';
import { iconUrl } from '../hud/icons';
import { t } from '../i18n';
import { button, el } from './dom';
import { itemColor, itemIcon, itemTooltip, type TipLine } from './item-logic';

export interface ItemsUiOptions {
  classId: string;
  level: () => number;
  request: (req: ProgressRequest) => void;
  isTyping: () => boolean;
}

/** Floating tooltip that follows the mouse (title attributes cannot show colours). */
class Tooltip {
  private readonly root = el('div', 'item-tip');

  constructor(parent: HTMLElement) {
    this.root.hidden = true;
    parent.append(this.root);
  }

  show(lines: TipLine[], e: MouseEvent): void {
    this.root.replaceChildren(
      ...lines.map((l, i) => {
        const d = el('div', i === 0 ? 'tip-title' : 'tip-line', l.text);
        if (l.color) d.style.color = l.color;
        return d;
      }),
    );
    this.root.hidden = false;
    this.move(e);
  }

  move(e: MouseEvent): void {
    const w = this.root.offsetWidth;
    const h = this.root.offsetHeight;
    this.root.style.left = `${Math.min(e.clientX + 14, innerWidth - w - 8)}px`;
    this.root.style.top = `${Math.min(e.clientY + 14, innerHeight - h - 8)}px`;
  }

  hide(): void {
    this.root.hidden = true;
  }

  destroy(): void {
    this.root.remove();
  }
}

/** An item square with its icon, rarity border, count and tooltip. */
export function itemSlot(item: Item | null | undefined, tip: Tooltip, tipLines: () => TipLine[], cls = ''): HTMLElement {
  const box = el('div', `item-slot ${cls}`.trim());
  if (!item) return box;
  box.style.borderColor = itemColor(item);
  const img = el('img', 'slot-icon');
  img.src = iconUrl(itemIcon(item));
  img.alt = '';
  box.append(img);
  if (isPotion(item)) box.append(el('span', 'item-count', String(item.count)));
  else if (item.durability === 0) box.classList.add('broken');
  box.dataset.uid = item.uid;
  box.onmouseenter = (e) => tip.show(tipLines(), e);
  box.onmousemove = (e) => tip.move(e);
  box.onmouseleave = () => tip.hide();
  return box;
}

/**
 * Inventory (I) and merchant windows. Like the other windows they only show the host's state
 * and send requests; nothing changes locally until the host answers.
 */
export class ItemsUi {
  private readonly bag = el('div', 'game-window side-window bag-window');
  private readonly shop = el('div', 'game-window side-window shop-window');
  readonly tip: Tooltip;
  private inv: InventoryInfo | null = null;
  private bagOpen = false;
  private readonly onKey = (e: KeyboardEvent) => this.key(e);

  constructor(
    parent: HTMLElement,
    private readonly opts: ItemsUiOptions,
  ) {
    this.bag.hidden = true;
    this.shop.hidden = true;
    this.bag.dataset.window = 'inventory';
    this.shop.dataset.window = 'merchant';
    this.tip = new Tooltip(parent);
    parent.append(this.bag, this.shop);
    document.addEventListener('keydown', this.onKey);
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKey);
    this.bag.remove();
    this.shop.remove();
    this.tip.destroy();
  }

  get inventoryOpen(): boolean {
    return this.bagOpen;
  }

  get merchantOpen(): boolean {
    return !!this.inv?.merchant;
  }

  update(inv: InventoryInfo): void {
    this.inv = inv;
    // The host closes the merchant when it says so; the bag opens with it.
    if (inv.merchant && !this.bagOpen) this.bagOpen = true;
    this.render();
  }

  toggleInventory(): void {
    this.bagOpen = !this.bagOpen;
    if (!this.bagOpen && this.merchantOpen) this.opts.request({ k: 'merchant', open: false });
    this.render();
  }

  openMerchant(): void {
    this.opts.request({ k: 'merchant', open: true });
  }

  closeAll(): boolean {
    const was = this.bagOpen || this.merchantOpen;
    if (this.merchantOpen) this.opts.request({ k: 'merchant', open: false });
    this.bagOpen = false;
    this.tip.hide();
    this.render();
    return was;
  }

  private key(e: KeyboardEvent): void {
    if (this.opts.isTyping() || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (e.code === 'KeyI') this.toggleInventory();
    else if (e.code === 'Escape' && (this.bagOpen || this.merchantOpen)) this.closeAll();
    else return;
    e.preventDefault();
  }

  private ctx(price?: string) {
    return { level: this.opts.level(), classId: this.opts.classId, equipment: this.inv?.equipment, ...(price ? { price } : {}) };
  }

  private render(): void {
    const inv = this.inv;
    this.tip.hide();
    this.bag.hidden = !this.bagOpen || !inv;
    this.shop.hidden = !inv?.merchant;
    if (!inv) return;
    if (this.bagOpen) this.renderBag(inv);
    if (inv.merchant) this.renderShop(inv);
  }

  private renderBag(inv: InventoryInfo): void {
    const head = el('div', 'win-head');
    head.append(el('h2', 'win-title', t('inventory.title')), button('btn small', '✕', () => this.toggleInventory()));
    const grid = el('div', 'bag-grid');
    inv.inventory.forEach((item, i) => {
      const price = item && inv.merchant ? t('item.sellPrice', { n: sellPrice(item, this.opts.level()) }) : undefined;
      const box = itemSlot(item, this.tip, () => (item ? itemTooltip(item, this.ctx(price)) : []));
      box.dataset.index = String(i);
      box.oncontextmenu = (e) => {
        e.preventDefault();
        if (!item) return;
        if (inv.merchant) this.opts.request({ k: 'sell', index: i });
        else if (isPotion(item)) this.opts.request({ k: 'use', potion: item.potion });
        else this.opts.request({ k: 'equip', index: i });
      };
      grid.append(box);
    });
    const gold = el('div', 'bag-gold', t('inventory.gold', { n: inv.gold }));
    this.bag.replaceChildren(head, grid, gold, el('div', 'muted', t('inventory.help')));
  }

  private renderShop(inv: InventoryInfo): void {
    const m = inv.merchant!;
    const head = el('div', 'win-head');
    head.append(el('h2', 'win-title', t('merchant.title')), button('btn small', '✕', () => this.opts.request({ k: 'merchant', open: false })));
    const list = el('div', 'shop-list');
    for (const s of m.stock) {
      const sample: Item = s.potion
        ? { uid: s.id, potion: s.potion, count: 1 }
        : { uid: s.id, baseId: s.baseId!, level: Math.max(1, Math.min(30, this.opts.level())), rarity: 'common', affixes: [], durability: 100 };
      const row = el('div', 'shop-row');
      row.dataset.stock = s.id;
      const box = itemSlot(sample, this.tip, () => itemTooltip(sample, this.ctx(t('item.price', { n: s.price }))));
      const name = el('span', 'shop-name', s.potion ? t(`item.potion.${s.potion}`) : t(itemBase(s.baseId!)?.nameKey ?? s.id));
      const buy = button('btn small', t('item.price', { n: s.price }), () => this.opts.request({ k: 'buy', id: s.id }));
      buy.disabled = inv.gold < s.price;
      row.append(box, name, buy);
      list.append(row);
    }
    const repair = button('btn', m.repairCost > 0 ? t('merchant.repair', { n: m.repairCost }) : t('merchant.nothingToRepair'), () => this.opts.request({ k: 'repair' }));
    repair.disabled = m.repairCost === 0 || inv.gold < m.repairCost;
    this.shop.replaceChildren(head, el('div', 'muted', t('merchant.help')), list, repair);
  }
}

const LEFT_PLACES: EquipSlot[] = ['head', 'shoulders', 'chest', 'hands', 'legs', 'feet'];
const RIGHT_PLACES: EquipSlot[] = ['weapon', 'offhand', 'neck', 'ring1', 'ring2'];

/** The 11 equipment places around the live character sprite (character window). */
export function equipmentPanel(
  inv: InventoryInfo | null,
  ui: ItemsUi,
  ctx: { level: number; classId: string },
  request: (r: ProgressRequest) => void,
  sprite: HTMLElement,
): HTMLElement {
  const column = (places: EquipSlot[]) => {
    const col = el('div', 'equip-col');
    for (const place of places) col.append(equipCell(place));
    return col;
  };
  const equipCell = (place: EquipSlot) => {
    const item = inv?.equipment[place] ?? null;
    const cell = el('div', 'equip-cell');
    const box = itemSlot(item, ui.tip, () => (item ? itemTooltip(item, { ...ctx }) : []), 'equip');
    box.dataset.place = place;
    box.title = item ? '' : t(`slot.${place}`);
    box.oncontextmenu = (e) => {
      e.preventDefault();
      if (item) request({ k: 'unequip', place });
    };
    cell.append(box);
    return cell;
  };
  const panel = el('div', 'equip-doll');
  const mid = el('div', 'equip-sprite');
  mid.append(sprite);
  panel.append(column(LEFT_PLACES), mid, column(RIGHT_PLACES));
  return panel;
}

export const BAG_SIZE = LOOT.inventorySize;
