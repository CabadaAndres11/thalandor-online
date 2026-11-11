import Phaser from 'phaser';
import type { CollisionMap } from '../../sim/collision-map';
import { PLAYER_RADIUS, TICK_MS, TILE_SIZE } from '../../sim/constants';
import type { EntityId, Vec2 } from '../../sim/types';
import type { ClientSession } from '../client-session';
import { inputFromKeys } from '../input';
import { TILES_KEY } from './BootScene';

export interface GameSceneData {
  session: ClientSession;
  map: CollisionMap;
  selfName: string;
  /** True while the chat box has focus: movement keys are ignored. */
  isTyping: () => boolean;
}

const COLORS = [0x4fc3f7, 0xffb74d, 0x81c784, 0xe57373];
const SELF_KEY = -1;

interface Avatar {
  body: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
}

export class GameScene extends Phaser.Scene {
  private data_!: GameSceneData;
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private avatars = new Map<EntityId, Avatar>();
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
    const { map } = this.data_;
    const grid: number[][] = [];
    for (let y = 0; y < map.heightTiles; y++) {
      const row: number[] = [];
      for (let x = 0; x < map.widthTiles; x++) row.push(map.isSolidTile(x, y) ? 1 : 0);
      grid.push(row);
    }
    const tilemap = this.make.tilemap({ data: grid, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = tilemap.addTilesetImage(TILES_KEY, TILES_KEY, TILE_SIZE, TILE_SIZE, 0, 0)!;
    tilemap.createLayer(0, tileset, 0, 0);

    // Second argument false: do not capture keys, so the chat input can still receive W/A/S/D.
    this.keys = this.input.keyboard!.addKeys('W,A,S,D', false) as GameScene['keys'];
    const cam = this.cameras.main;
    cam.setZoom(2);
    cam.setRoundPixels(true);
    cam.setBounds(0, 0, map.widthTiles * TILE_SIZE, map.heightTiles * TILE_SIZE);

    // Inputs go out on a fixed 20/s timer, independent of render FPS (a slow PC must not move slower).
    this.inputTimer = setInterval(() => this.sendTickInput(), TICK_MS);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => clearInterval(this.inputTimer));
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
    const { session } = this.data_;
    const now = performance.now();

    const rs = session.renderState(now);
    const seen = new Set<EntityId>();
    if (rs.self) {
      seen.add(SELF_KEY);
      this.place(SELF_KEY, session.playerId ?? 0, this.data_.selfName, rs.self);
      this.cameras.main.centerOn(rs.self.x, rs.self.y);
    }
    for (const [id, o] of rs.others) {
      seen.add(id);
      this.place(id, id, o.name, o.pos);
    }
    for (const [id, a] of this.avatars) {
      if (!seen.has(id)) {
        a.body.destroy();
        a.label.destroy();
        this.avatars.delete(id);
      }
    }
  }

  private place(key: EntityId, colorId: number, name: string, pos: Vec2): void {
    let a = this.avatars.get(key);
    if (!a) {
      const color = COLORS[(Math.max(1, colorId) - 1) % COLORS.length]!;
      const body = this.add.circle(pos.x, pos.y, PLAYER_RADIUS, color).setStrokeStyle(1, 0x101010);
      const label = this.add
        .text(pos.x, pos.y, name, { fontFamily: 'Georgia, serif', fontSize: '16px', color: '#f1e9d2', stroke: '#101010', strokeThickness: 3 })
        .setOrigin(0.5, 1)
        .setScale(0.5)
        .setResolution(2);
      a = { body, label };
      this.avatars.set(key, a);
    }
    a.body.setPosition(pos.x, pos.y);
    a.label.setPosition(pos.x, pos.y - PLAYER_RADIUS - 2);
    if (a.label.text !== name) a.label.setText(name);
  }
}
