import Phaser from 'phaser';
import type { ActionAnim, Anim, CreatureLook } from '../../appearance/catalog-types';
import { actionFrameAt, ANIM_GEOMETRY, frameRect, walkFrameAt } from '../../appearance/lpc-frames';
import type { Vec2 } from '../../sim/types';
import { layerSource, loadedImage, type ReadyLayer } from './sheets';

/** Pixels between the feet in an LPC frame and the frame's bottom edge (tuned by eye). */
export const FEET_OFFSET_Y = 2;
const LABEL_OFFSET_Y = 54;
const BAR_W = 28;

export interface AvatarState {
  pos: Vec2;
  facing: number;
  moving: boolean;
  action: { anim: ActionAnim; startedAt: number } | null;
  name: string;
  hp: number;
  maxHp: number;
  state: 'alive' | 'downed' | 'dead';
  /** Show the overhead health bar. */
  showBar: boolean;
  /** Bar colour: allies green, monsters red. */
  hostile: boolean;
  /** Drawn translucent (stealth). */
  faded?: boolean;
}

export interface Avatar {
  readonly lookKey: string;
  setState(s: AvatarState, timeMs: number): void;
  destroy(): void;
}

const frameName = (facing: number, frame: number) => `${facing}_${frame}`;

/** Registers a sheet canvas as a texture with one named frame per (facing, frame) of an animation. */
function ensureTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement, anim: Anim, frameSize: number): string {
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.addCanvas(key, canvas)!;
    const g = ANIM_GEOMETRY[anim];
    for (let facing = 0; facing < g.rows; facing++) {
      for (let f = 0; f < g.frames; f++) {
        const r = frameRect(anim, facing, f, frameSize);
        if (r.x + r.w <= canvas.width && r.y + r.h <= canvas.height) tex.add(frameName(facing, f), 0, r.x, r.y, r.w, r.h);
      }
    }
  }
  return key;
}

/** Which animation and frame to show for a state at a time. */
function pick(s: AvatarState, timeMs: number): { anim: Anim; frame: number; facing: number } {
  if (s.state !== 'alive') return { anim: 'hurt', frame: ANIM_GEOMETRY.hurt.frames - 1, facing: 0 };
  if (s.action) {
    const f = actionFrameAt(s.action.anim, timeMs - s.action.startedAt);
    if (f !== null) return { anim: s.action.anim, frame: f, facing: ANIM_GEOMETRY[s.action.anim].rows === 1 ? 0 : s.facing };
  }
  return { anim: 'walk', frame: walkFrameAt(timeMs, s.moving), facing: s.facing };
}

class Overhead {
  readonly label: Phaser.GameObjects.Text;
  readonly bar: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, name: string) {
    this.label = scene.add
      .text(0, 0, name, { fontFamily: 'Georgia, serif', fontSize: '16px', color: '#f1e9d2', stroke: '#101010', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setScale(0.5)
      .setResolution(2)
      .setDepth(1e6);
    this.bar = scene.add.graphics().setDepth(1e6);
  }

  update(s: AvatarState, x: number, top: number): void {
    this.label.setPosition(x, top - (s.showBar ? 5 : 0));
    if (this.label.text !== s.name) this.label.setText(s.name);
    this.label.setVisible(s.name !== '');
    this.bar.clear();
    if (!s.showBar || s.state === 'dead' || s.maxHp <= 0) return;
    const pct = Math.max(0, Math.min(1, s.hp / s.maxHp));
    this.bar.fillStyle(0x101010, 0.85).fillRect(x - BAR_W / 2 - 1, top - 4, BAR_W + 2, 5);
    this.bar.fillStyle(s.hostile ? 0xd04030 : 0x58c060, 1).fillRect(x - BAR_W / 2, top - 3, BAR_W * pct, 3);
  }

  destroy(): void {
    this.label.destroy();
    this.bar.destroy();
  }
}

/** A humanoid drawn as stacked LPC layers that always show the same animation frame. */
export class LpcAvatar implements Avatar {
  private readonly images: { layer: ReadyLayer; img: Phaser.GameObjects.Image }[];
  private readonly overhead: Overhead;

  constructor(
    private readonly scene: Phaser.Scene,
    layers: ReadyLayer[],
    name: string,
    readonly lookKey: string,
  ) {
    this.images = layers.map((layer) => ({ layer, img: scene.add.image(0, 0, '__DEFAULT').setVisible(false) }));
    this.overhead = new Overhead(scene, name);
  }

  setState(s: AvatarState, timeMs: number): void {
    const { anim, frame, facing } = pick(s, timeMs);
    const x = Math.round(s.pos.x);
    const y = Math.round(s.pos.y + FEET_OFFSET_Y);
    for (const { layer, img } of this.images) {
      const src = layerSource(layer, anim);
      if (!src) {
        img.setVisible(false);
        continue;
      }
      const key = ensureTexture(this.scene, `lpc:${layer.key}:${anim}`, src.canvas, anim, src.frameSize);
      const fs = src.frameSize;
      // Oversize sheets keep the 64 px character centred in the bigger frame.
      const oy = (fs - (fs - 64) / 2) / fs;
      img.setTexture(key, frameName(facing, frame)).setOrigin(0.5, oy).setPosition(x, y).setDepth(s.pos.y).setVisible(true);
      img.setAlpha(s.state === 'dead' ? 0.6 : s.faded ? 0.35 : 1);
    }
    this.overhead.update(s, x, y - LABEL_OFFSET_Y);
  }

  destroy(): void {
    for (const { img } of this.images) img.destroy();
    this.overhead.destroy();
  }
}

/** A single-sheet creature (LPC Monsters pack). */
export class CreatureAvatar implements Avatar {
  private readonly img: Phaser.GameObjects.Image;
  private readonly overhead: Overhead;
  private readonly key: string;

  constructor(
    scene: Phaser.Scene,
    private readonly look: CreatureLook,
    name: string,
    readonly lookKey: string,
  ) {
    this.key = `creature:${look.sheet}`;
    if (!scene.textures.exists(this.key)) {
      const img = loadedImage(look.sheet);
      if (img) {
        const tex = scene.textures.addImage(this.key, img)!;
        const cols = Math.floor(img.naturalWidth / look.frameSize);
        for (let row = 0; row < 4; row++) for (let c = 0; c < cols; c++) tex.add(frameName(row, c), 0, c * look.frameSize, row * look.frameSize, look.frameSize, look.frameSize);
      }
    }
    this.img = scene.add.image(0, 0, this.key).setOrigin(0.5, 0.85);
    this.overhead = new Overhead(scene, name);
  }

  setState(s: AvatarState, timeMs: number): void {
    const attacking = s.action && timeMs - s.action.startedAt < 300;
    const frames = attacking ? this.look.attackFrames : this.look.moveFrames;
    const frame = frames[Math.floor(timeMs / 110) % frames.length] ?? 0;
    const x = Math.round(s.pos.x);
    const y = Math.round(s.pos.y);
    if (this.img.texture.key === this.key) this.img.setFrame(frameName(s.facing, frame));
    this.img.setPosition(x, y).setDepth(s.pos.y).setAlpha(s.state === 'dead' ? 0.4 : 1).setAngle(s.state === 'dead' ? 90 : 0);
    this.overhead.update(s, x, y - 34);
  }

  destroy(): void {
    this.img.destroy();
    this.overhead.destroy();
  }
}
