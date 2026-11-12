import { gearLook } from '../../appearance/catalog';
import type { GearSlot } from '../../appearance/catalog-types';
import { frameRect, FRAME_SIZE } from '../../appearance/lpc-frames';
import { itemBase, isPotion, type Item } from '../../sim/items/defs';
import { iconUrl } from '../hud/icons';
import { readyLayer } from './sheets';

/** Which way the piece is shown: weapons from the side, shields from their side, armour from the front. */
const FACING: Partial<Record<GearSlot, number>> = { weapon: 3, offhand: 1 };
const DOWN = 2;
const cache = new Map<string, string>();

/**
 * An icon drawn from the piece's own sprite: its layers alone (no body), one frame, cropped to the
 * visible pixels. Null while the sheets are not loaded yet (callers fall back to the glyph icon).
 */
export function lookIconUrl(lookId: string): string | null {
  const hit = cache.get(lookId);
  if (hit) return hit;
  const look = gearLook(lookId);
  const layers = look?.bodies.male ?? (look ? Object.values(look.bodies)[0] : undefined);
  if (!look || !layers?.length) return null;
  const facing = FACING[look.slot] ?? DOWN;
  const size = Math.max(FRAME_SIZE, ...layers.map((l) => (l.actionOnly ? (l.anims?.shoot?.frameSize ?? FRAME_SIZE) : FRAME_SIZE)));
  const frame = document.createElement('canvas');
  frame.width = size;
  frame.height = size;
  const g = frame.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  for (const layer of [...layers].sort((a, b) => a.zIndex - b.zIndex)) {
    const ready = readyLayer(layer);
    if (!ready) return null;
    // Bows only exist mid-shot: use a frame of the shooting animation.
    const src = layer.actionOnly ? ready.anims.shoot : { canvas: ready.canvas, frameSize: FRAME_SIZE };
    if (!src) continue;
    const r = layer.actionOnly ? frameRect('shoot', facing, 8, src.frameSize) : frameRect('walk', facing, 0, src.frameSize);
    const off = (size - src.frameSize) / 2;
    g.drawImage(src.canvas, r.x, r.y, r.w, r.h, off, off, r.w, r.h);
  }
  const box = opaqueBounds(g, size);
  if (!box) return null;
  const side = Math.max(box.w, box.h) + 2;
  const out = document.createElement('canvas');
  out.width = side;
  out.height = side;
  const o = out.getContext('2d')!;
  o.imageSmoothingEnabled = false;
  o.drawImage(frame, box.x, box.y, box.w, box.h, Math.floor((side - box.w) / 2), Math.floor((side - box.h) / 2), box.w, box.h);
  const url = out.toDataURL();
  cache.set(lookId, url);
  return url;
}

function opaqueBounds(g: CanvasRenderingContext2D, size: number): { x: number; y: number; w: number; h: number } | null {
  const data = g.getImageData(0, 0, size, size).data;
  let x0 = size;
  let y0 = size;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[(y * size + x) * 4 + 3]! === 0) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The image for an item: its sprite when it has a visible look, otherwise its glyph icon. */
export function itemImage(item: Item, glyph: string): { src: string; sprite: boolean } {
  if (!isPotion(item)) {
    const look = itemBase(item.baseId)?.look;
    const url = look ? lookIconUrl(look) : null;
    if (url) return { src: url, sprite: true };
  }
  return { src: iconUrl(glyph), sprite: false };
}
