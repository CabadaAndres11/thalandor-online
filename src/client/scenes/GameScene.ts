import Phaser from 'phaser';
import { defaultAppearance, type Appearance, type ClassId } from '../../appearance/catalog';
import type { TiledMap } from '../../sim/collision-map';
import { TICK_MS } from '../../sim/constants';
import type { EntityId } from '../../sim/types';
import type { ClientSession } from '../client-session';
import { inputFromKeys } from '../input';
import { LpcAvatar } from '../render/lpc-avatar';
import { readyLayers } from '../render/sheets';
import { TERRAIN_KEY } from './BootScene';

export interface GameSceneData {
  session: ClientSession;
  mapId: string;
  mapJson: TiledMap;
  self: { name: string; classId: ClassId; appearance: Appearance };
  /** True while the chat box has focus: movement keys are ignored. */
  isTyping: () => boolean;
}

const SELF_KEY = -1;
const CAMERA_ZOOM = 1.5;
const lookKey = (classId: ClassId, a: Appearance) => `${classId}|${a.body}|${a.skin}|${a.hairStyle}|${a.hairColor}`;

export class GameScene extends Phaser.Scene {
  private data_!: GameSceneData;
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private avatars = new Map<EntityId, LpcAvatar>();
  private inputTimer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    super('game');
  }

  /** Number of players currently drawn (self included). Used by E2E tests. */
  get drawnPlayers(): number {
    return this.avatars.size;
  }

  init(data: GameSceneData): void {
    this.data_ = data;
    this.avatars = new Map();
  }

  create(): void {
    const { mapId, mapJson } = this.data_;
    if (!this.cache.tilemap.exists(mapId)) this.cache.tilemap.add(mapId, { format: Phaser.Tilemaps.Formats.TILED_JSON, data: mapJson });
    const tilemap = this.make.tilemap({ key: mapId });
    const tileset = tilemap.addTilesetImage(tilemap.tilesets[0]!.name, TERRAIN_KEY)!;
    for (const name of ['ground', 'decor', 'collision']) {
      if (tilemap.getLayerIndex(name) !== null) tilemap.createLayer(name, tileset, 0, 0);
    }

    // Second argument false: do not capture keys, so the chat input can still receive W/A/S/D.
    this.keys = this.input.keyboard!.addKeys('W,A,S,D', false) as GameScene['keys'];
    const cam = this.cameras.main;
    cam.setZoom(CAMERA_ZOOM);
    cam.setRoundPixels(true);
    cam.setBounds(0, 0, tilemap.widthInPixels, tilemap.heightInPixels);

    // Inputs go out on a fixed 20/s timer, independent of render FPS (a slow PC must not move slower).
    this.inputTimer = setInterval(() => this.sendTickInput(), TICK_MS);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      clearInterval(this.inputTimer);
      for (const a of this.avatars.values()) a.destroy();
      this.avatars.clear();
    });
  }

  private sendTickInput(): void {
    const { session, isTyping } = this.data_;
    const typing = isTyping();
    const pointer = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    session.sendInput(
      inputFromKeys(
        {
          up: !typing && this.keys.W.isDown,
          down: !typing && this.keys.S.isDown,
          left: !typing && this.keys.A.isDown,
          right: !typing && this.keys.D.isDown,
        },
        { x: pointer.x, y: pointer.y },
      ),
    );
    session.checkTimeout(performance.now());
  }

  update(): void {
    const { session, self } = this.data_;
    const now = performance.now();
    const rs = session.renderState(now);
    const seen = new Set<EntityId>();
    if (rs.self) {
      seen.add(SELF_KEY);
      this.avatarFor(SELF_KEY, self.name, self.classId, self.appearance).setState(rs.self.pos, rs.self.facing, rs.self.moving, now, self.name);
      this.cameras.main.centerOn(rs.self.pos.x, rs.self.pos.y - 24);
    }
    for (const [id, o] of rs.others) {
      seen.add(id);
      const classId = o.classId ?? 'warrior';
      this.avatarFor(id, o.name, classId, o.appearance ?? defaultAppearance(classId)).setState(o.pos, o.facing, o.moving, now, o.name);
    }
    for (const [id, a] of this.avatars) {
      if (!seen.has(id)) {
        a.destroy();
        this.avatars.delete(id);
      }
    }
  }

  /** Returns the avatar for an entity, rebuilding it if its class or appearance changed (e.g. roster arrived). */
  private avatarFor(id: EntityId, name: string, classId: ClassId, appearance: Appearance): LpcAvatar {
    const key = lookKey(classId, appearance);
    let a = this.avatars.get(id);
    if (a && a.lookKey !== key) {
      a.destroy();
      a = undefined;
    }
    if (!a) {
      a = new LpcAvatar(this, readyLayers(classId, appearance), name, key);
      this.avatars.set(id, a);
    }
    return a;
  }
}
