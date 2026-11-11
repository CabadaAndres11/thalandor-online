import Phaser from 'phaser';
import { FRAME_SIZE, WALK_FRAMES, walkFrameAt, walkFrameRect } from '../../appearance/lpc-frames';
import type { Vec2 } from '../../sim/types';
import type { ReadyLayer } from './sheets';

/** Pixels between the feet in an LPC frame and the frame's bottom edge (tuned by eye). */
export const FEET_OFFSET_Y = 2;
/** Height of the name label above the feet. */
const LABEL_OFFSET_Y = 54;

const frameName = (facing: number, frame: number) => `${facing}_${frame}`;

/** Registers a recolored sheet as a Phaser texture with one named frame per (facing, walk frame). */
function ensureTexture(scene: Phaser.Scene, layer: ReadyLayer): string {
  const key = `lpc:${layer.key}`;
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.addCanvas(key, layer.canvas)!;
    for (let facing = 0; facing < 4; facing++) {
      for (let frame = 0; frame < WALK_FRAMES; frame++) {
        const r = walkFrameRect(facing, frame);
        tex.add(frameName(facing, frame), 0, r.x, r.y, r.w, r.h);
      }
    }
  }
  return key;
}

/** A character drawn as stacked LPC layers that always show the same frame. */
export class LpcAvatar {
  private readonly images: Phaser.GameObjects.Image[];
  private readonly label: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    layers: ReadyLayer[],
    name: string,
    /** Identifies class + appearance, so the scene can rebuild the avatar when it changes. */
    readonly lookKey: string,
  ) {
    this.images = layers.map((l) => scene.add.image(0, 0, ensureTexture(scene, l), frameName(2, 0)).setOrigin(0.5, 1));
    this.label = scene.add
      .text(0, 0, name, { fontFamily: 'Georgia, serif', fontSize: '16px', color: '#f1e9d2', stroke: '#101010', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setScale(0.5)
      .setResolution(2)
      .setDepth(1e6);
  }

  setState(pos: Vec2, facing: number, moving: boolean, timeMs: number, name: string): void {
    const frame = frameName(facing, walkFrameAt(timeMs, moving));
    const y = Math.round(pos.y + FEET_OFFSET_Y);
    const x = Math.round(pos.x);
    for (const img of this.images) {
      img.setFrame(frame);
      img.setPosition(x, y);
      img.setDepth(pos.y);
    }
    this.label.setPosition(x, y - LABEL_OFFSET_Y);
    if (this.label.text !== name) this.label.setText(name);
  }

  destroy(): void {
    for (const img of this.images) img.destroy();
    this.label.destroy();
  }
}

export const AVATAR_HEIGHT = FRAME_SIZE;
