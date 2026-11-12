import Phaser from 'phaser';
import { CATALOG, defaultAppearance, type Appearance, type ClassId } from '../../appearance/catalog';
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
}

const SELF_KEY = -1;
const CAMERA_ZOOM = 1.5;
const playerLook = (classId: ClassId, a: Appearance) => `p|${classId}|${a.body}|${a.skin}|${a.hairStyle}|${a.hairColor}`;
const SLOT_KEYS: [string, PressSlot][] = [
  ['ONE', 's1'],
  ['TWO', 's2'],
  ['THREE', 's3'],
  ['FOUR', 's4'],
  ['SPACE', 'dodge'],
];

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
    for (const [code, slot] of SLOT_KEYS) {
      this.input.keyboard!.addKey(code, false).on('down', () => this.pressSlot(slot));
    }
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.data_.isTyping()) return;
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
      this.effects.destroy();
      hud.hide();
    });
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
      if (pointer.leftButtonDown()) buttons |= BUTTON.lmb;
      if (pointer.rightButtonDown()) buttons |= BUTTON.rmb;
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
    if (rs.self) {
      seen.add(SELF_KEY);
      this.screenPos.set(SELF_KEY, rs.self.pos);
      this.avatarForPlayer(SELF_KEY, self.name, self.classId, self.appearance).setState(
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
    this.effects.update(delta, now);
    hud.update(rs, session.meState);
  }

  private playerAvatar(id: EntityId, o: UnitRender): Avatar {
    const classId = (o.classId ?? 'warrior') as ClassId;
    return this.avatarForPlayer(id, o.name, classId, o.appearance ?? defaultAppearance(classId));
  }

  private avatarForPlayer(id: EntityId, name: string, classId: ClassId, appearance: Appearance): Avatar {
    return this.avatarFor(id, playerLook(classId, appearance), () => new LpcAvatar(this, readyLayers(classId, appearance), name, playerLook(classId, appearance)));
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
