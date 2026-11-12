import { FRAME_SIZE, walkFrameAt, walkFrameRect } from '../../appearance/lpc-frames';
import type { Appearance, ClassId, GearLooks } from '../../appearance/catalog';
import { layerSource, loadSheet, readyLayers } from './sheets';
import { resolveLayers } from '../../appearance/catalog';

/** Which walk frame a menu preview shows at a given time (always walking). */
export function previewFrame(timeMs: number, facing: number): { facing: number; frame: number } {
  return { facing, frame: walkFrameAt(timeMs, true) };
}

/** Animated character preview drawn on a <canvas> (menus; independent of Phaser). */
export class PreviewCanvas {
  private classId: ClassId | null = null;
  private appearance: Appearance | null = null;
  private gear: GearLooks = {};
  private facing = 2;
  private raf = 0;
  private token = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly scale = 2,
  ) {
    canvas.width = FRAME_SIZE * scale;
    canvas.height = FRAME_SIZE * scale;
  }

  async setCharacter(classId: ClassId, appearance: Appearance, gear: GearLooks = {}): Promise<void> {
    const token = ++this.token;
    await Promise.all(resolveLayers(classId, appearance, gear).map((l) => loadSheet(l.sheet).catch(() => null)));
    if (token !== this.token) return;
    this.classId = classId;
    this.appearance = appearance;
    this.gear = gear;
  }

  setFacing(f: number): void {
    this.facing = ((f % 4) + 4) % 4;
  }

  get currentFacing(): number {
    return this.facing;
  }

  start(): void {
    if (this.raf) return;
    const loop = (t: number) => {
      this.draw(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private draw(t: number): void {
    const g = this.canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.classId || !this.appearance) return;
    const { facing, frame } = previewFrame(t, this.facing);
    const r = walkFrameRect(facing, frame);
    for (const layer of readyLayers(this.classId, this.appearance, this.gear)) {
      const src = layerSource(layer, 'walk');
      if (src) g.drawImage(src.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w * this.scale, r.h * this.scale);
    }
  }
}
