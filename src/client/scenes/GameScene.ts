import Phaser from 'phaser';
import { CATALOG, defaultAppearance, type Appearance, type ClassId, type GearLooks } from '../../appearance/catalog';
import { isPotion } from '../../sim/items/defs';
import { itemName } from '../ui/item-logic';
import { t } from '../i18n';
import type { TiledMap } from '../../sim/collision-map';
import { TICK_MS } from '../../sim/constants';
import { MONSTERS } from '../../sim/combat/defs';
import { BUTTON } from '../../sim/combat/unit';
import type { EntityId, PressSlot, Vec2 } from '../../sim/types';
import type { ClientSession, UnitRender } from '../client-session';
import type { Hud } from '../hud/hud';
import { inputFromKeys } from '../input';
import { Effects } from '../render/effects';
import { CreatureAvatar, LpcAvatar, type Avatar } from '../render/lpc-avatar';
import { readyLayers, readyMonsterLayers } from '../render/sheets';
import { TERRAIN_KEY } from './BootScene';

export interface GameSceneData {
  session: ClientSession;
  mapId: string;
  mapJson: TiledMap;
  self: { name: string; classId: ClassId; appearance: Appearance };
  hud: Hud;
  /** True while the chat box has focus: game keys are ignored. */
  isTyping: () => boolean;
  /** E pressed next to the merchant. */
  onMerchant?: () => void;
}

const SELF_KEY = -1;
const CAMERA_ZOOM = 1.5;
const playerLook = (classId: ClassId, a: Appearance, gear: GearLooks = {}) =>
  `p|${classId}|${a.body}|${a.skin}|${a.hairStyle}|${a.hairColor}|${Object.entries(gear).sort().map(([s, l]) => `${s}:${l}`).join(',')}`;
const MERCHANT_KEY = -2;
const MERCHANT_LOOK: GearLooks = { chest: 'chest_shirt_maroon', head: 'head_cap_brown', legs: 'legs_pants_brown' };
const MERCHANT_RANGE = 64;
const RARITY_TINT: Record<string, number> = { common: 0xe8e4d8, uncommon: 0x5fd068, rare: 0x4a90f0, epic: 0xb06af0 };
/** KeyboardEvent.code -> slot. Read from DOM events (not Phaser keys) so text typed in the chat never casts. */
const SLOT_KEYS: Record<string, PressSlot> = { Digit1: 's1', Digit2: 's2', Digit3: 's3', Digit4: 's4', Numpad1: 's1', Numpad2: 's2', Numpad3: 's3', Numpad4: 's4', Space: 'dodge' };

export class GameScene extends Phaser.Scene {
  private data_!: GameSceneData;
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'E', Phaser.Input.Keyboard.Key>;
  private avatars = new Map<EntityId, Avatar>();
  private effects!: Effects;
  private inputTimer: ReturnType<typeof setInterval> | undefined;
  private screenPos = new Map<EntityId, Vec2>();

  constructor() {
    super('game');
  }

  /** Number of players currently drawn (self included). Used by E2E tests. */
  get drawnPlayers(): number {
    let n = 0;
    for (const key of this.avatars.keys()) if (key === SELF_KEY || this.playerIds.has(key)) n++;
    return n;
  }

  private playerIds = new Set<EntityId>();

  init(data: GameSceneData): void {
    this.data_ = data;
    this.avatars = new Map();
    this.screenPos = new Map();
  }

  create(): void {
    const { mapId, mapJson, session, hud, self } = this.data_;
    if (!this.cache.tilemap.exists(mapId)) this.cache.tilemap.add(mapId, { format: Phaser.Tilemaps.Formats.TILED_JSON, data: mapJson });
    const tilemap = this.make.tilemap({ key: mapId });
    const tileset = tilemap.addTilesetImage(tilemap.tilesets[0]!.name, TERRAIN_KEY)!;
    for (const name of ['ground', 'decor', 'collision']) {
      if (tilemap.getLayerIndex(name) !== null) tilemap.createLayer(name, tileset, 0, 0);
    }

    // Second argument false: do not capture keys, so the chat input can still receive them.
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,E', false) as GameScene['keys'];
    const onKey = (e: KeyboardEvent) => {
      const slot = SLOT_KEYS[e.code];
      const target = e.target as HTMLElement | null;
      if (e.repeat || (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) || this.data_.isTyping()) return;
      if (e.code === 'KeyQ' || e.code === 'KeyR') {
        this.data_.session.requestProgress({ k: 'use', potion: e.code === 'KeyQ' ? 'health' : 'resource' });
        this.data_.hud.flash(e.code === 'KeyQ' ? 'potionQ' : 'potionR');
        return;
      }
      if (e.code === 'KeyE' && this.nearMerchant()) {
        this.data_.onMerchant?.();
        return;
      }
      if (!slot) return;
      if (slot === 'dodge') e.preventDefault();
      this.pressSlot(slot);
    };
    document.addEventListener('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => document.removeEventListener('keydown', onKey));
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // Clicks on HTML windows over the canvas (e.g. the "+" of an attribute) are not attacks.
      if (this.data_.isTyping() || !this.onCanvas(p)) return;
      this.pressSlot(p.rightButtonDown() ? 'rmb' : 'lmb');
    });
    const cam = this.cameras.main;
    cam.setZoom(CAMERA_ZOOM);
    cam.setRoundPixels(true);
    cam.setBounds(0, 0, tilemap.widthInPixels, tilemap.heightInPixels);

    this.effects = new Effects(
      this,
      (id) => (id === session.playerId ? (this.screenPos.get(SELF_KEY) ?? null) : (this.screenPos.get(id) ?? null)),
      () => session.playerId,
    );
    session.on('combat', ({ list }) => {
      if (this.sys.isActive()) this.effects.handle(list, performance.now());
    });
    hud.show(self.classId);
    if (session.progress) hud.setProgress(session.progress);

    // Inputs go out on a fixed 20/s timer, independent of render FPS (a slow PC must not move slower).
    this.inputTimer = setInterval(() => this.sendTickInput(), TICK_MS);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      clearInterval(this.inputTimer);
      for (const a of this.avatars.values()) a.destroy();
      this.avatars.clear();
      for (const o of this.lootObjects.values()) {
        o.glow.destroy();
        o.label.destroy();
      }
      this.lootObjects.clear();
      this.effects.destroy();
      hud.hide();
    });
  }

  /** Whether the pointer was pressed on the game canvas (not on HTML UI on top of it). */
  private onCanvas(p: Phaser.Input.Pointer): boolean {
    return !p.downElement || p.downElement === this.game.canvas;
  }

  private nearMerchant(): boolean {
    const m = this.data_.session.merchant;
    const s = this.screenPos.get(SELF_KEY);
    return !!m && !!s && Math.hypot(m.x - s.x, m.y - s.y) <= MERCHANT_RANGE;
  }

  /** The merchant NPC (drawn like a player, standing still). */
  private drawMerchant(now: number): void {
    const m = this.data_.session.merchant;
    if (!m) return;
    const a = defaultAppearance('cleric');
    const avatar = this.avatarForPlayer(MERCHANT_KEY, t('merchant.name'), 'cleric', a, MERCHANT_LOOK);
    avatar.setState({ pos: m, facing: 2, moving: false, action: null, name: t('merchant.name'), hp: 1, maxHp: 1, state: 'alive', showBar: false, hostile: false }, now);
  }

  private lootObjects = new Map<number, { glow: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text }>();

  /** Own drops on the ground: a glow in the rarity colour and the item's name. */
  private drawLoot(): void {
    const drops = this.data_.session.loot;
    for (const [id, o] of this.lootObjects) {
      if (!drops.has(id)) {
        o.glow.destroy();
        o.label.destroy();
        this.lootObjects.delete(id);
      }
    }
    for (const [id, d] of drops) {
      if (this.lootObjects.has(id)) continue;
      const item = d.item;
      const tint = item ? (isPotion(item) ? 0xd04040 : RARITY_TINT[item.rarity]!) : 0xf0c040;
      const text = item ? itemName(item) : t('inventory.gold', { n: d.gold ?? 0 });
      const glow = this.add.circle(d.x, d.y, item ? 5 : 4, tint, 0.9).setStrokeStyle(2, 0xffffff, 0.5).setDepth(d.y - 1);
      this.tweens.add({ targets: glow, alpha: 0.45, yoyo: true, repeat: -1, duration: 600 });
      const label = this.add
        .text(d.x, d.y - 8, text, { fontFamily: 'Georgia, serif', fontSize: '14px', color: '#' + tint.toString(16).padStart(6, '0'), stroke: '#101010', strokeThickness: 3 })
        .setOrigin(0.5, 1)
        .setScale(0.5)
        .setResolution(2)
        .setDepth(1e6 - 1);
      this.lootObjects.set(id, { glow, label });
    }
  }

  private aim(): Vec2 {
    const p = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    return { x: p.x, y: p.y };
  }

  private pressSlot(slot: PressSlot): void {
    if (this.data_.isTyping()) return;
    this.data_.session.press(slot, this.aim());
    this.data_.hud.flash(slot);
  }

  private sendTickInput(): void {
    const { session, isTyping } = this.data_;
    const typing = isTyping();
    const pointer = this.input.activePointer;
    let buttons = 0;
    if (!typing) {
      if (pointer.leftButtonDown() && this.onCanvas(pointer)) buttons |= BUTTON.lmb;
      if (pointer.rightButtonDown() && this.onCanvas(pointer)) buttons |= BUTTON.rmb;
      if (this.keys.E.isDown) buttons |= BUTTON.interact;
    }
    const move = inputFromKeys(
      {
        up: !typing && this.keys.W.isDown,
        down: !typing && this.keys.S.isDown,
        left: !typing && this.keys.A.isDown,
        right: !typing && this.keys.D.isDown,
      },
      this.aim(),
    );
    session.sendInput({ ...move, buttons });
    session.checkTimeout(performance.now());
  }

  update(_time: number, delta: number): void {
    const { session, self, hud } = this.data_;
    const now = performance.now();
    const rs = session.renderState(now);
    const seen = new Set<EntityId>();
    this.playerIds.clear();
    if (session.merchant) {
      seen.add(MERCHANT_KEY);
      this.drawMerchant(now);
    }
    if (rs.self) {
      seen.add(SELF_KEY);
      this.screenPos.set(SELF_KEY, rs.self.pos);
      this.avatarForPlayer(SELF_KEY, self.name, self.classId, self.appearance, session.selfGear).setState(
        { ...rs.self, name: self.name, showBar: false, hostile: false, faded: !!rs.self.stealth },
        now,
      );
      this.cameras.main.centerOn(rs.self.pos.x, rs.self.pos.y - 24);
    }
    for (const [id, o] of rs.others) {
      seen.add(id);
      this.screenPos.set(id, o.pos);
      const avatar = o.kind === 'player' ? this.playerAvatar(id, o) : this.monsterAvatar(id, o);
      if (o.kind === 'player') this.playerIds.add(id);
      avatar?.setState(
        { pos: o.pos, facing: o.facing, moving: o.moving, action: o.action, name: o.kind === 'player' ? o.name : '', hp: o.hp, maxHp: o.maxHp, state: o.state, showBar: true, hostile: o.kind === 'monster', faded: !!o.stealth },
        now,
      );
    }
    for (const [id, a] of this.avatars) {
      if (!seen.has(id)) {
        a.destroy();
        this.avatars.delete(id);
        this.screenPos.delete(id);
      }
    }
    this.drawLoot();
    this.effects.update(delta, now);
    hud.update(rs, session.meState);
    hud.setPotions(session.inventory, session.potionCooldownMs(now));
    hud.setMerchantPrompt(this.nearMerchant());
  }

  private playerAvatar(id: EntityId, o: UnitRender): Avatar {
    const classId = (o.classId ?? 'warrior') as ClassId;
    return this.avatarForPlayer(id, o.name, classId, o.appearance ?? defaultAppearance(classId), o.gear ?? {});
  }

  private avatarForPlayer(id: EntityId, name: string, classId: ClassId, appearance: Appearance, gear: GearLooks = {}): Avatar {
    const key = playerLook(classId, appearance, gear);
    return this.avatarFor(id, key, () => new LpcAvatar(this, readyLayers(classId, appearance, gear), name, key));
  }

  private monsterAvatar(id: EntityId, o: UnitRender): Avatar | null {
    const def = MONSTERS[o.type];
    if (!def) return null;
    const key = `m|${o.type}`;
    if (def.look.kind === 'creature') {
      const look = CATALOG.creatures[def.look.id];
      if (!look) return null;
      return this.avatarFor(id, key, () => new CreatureAvatar(this, look, '', key));
    }
    return this.avatarFor(id, key, () => new LpcAvatar(this, readyMonsterLayers(def.look.id), '', key));
  }

  /** Returns the avatar for an entity, rebuilding it when its look changes (e.g. roster arrived). */
  private avatarFor(id: EntityId, key: string, make: () => Avatar): Avatar {
    let a = this.avatars.get(id);
    if (a && a.lookKey !== key) {
      a.destroy();
      a = undefined;
    }
    if (!a) {
      a = make();
      this.avatars.set(id, a);
    }
    return a;
  }
}
