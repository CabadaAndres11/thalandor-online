import type { Material, Recolor } from './catalog-types';
import type { Appearance } from './catalog';

const hexToInt = (hex: string) => parseInt(hex.replace('#', ''), 16);

/** Maps each base ramp color (as 0xRRGGBB) to the color at the same index in the target ramp. */
export function buildColorMap(base: string[], target: string[]): Map<number, number> {
  const map = new Map<number, number>();
  base.forEach((c, i) => {
    const t = target[i];
    if (t !== undefined) map.set(hexToInt(c), hexToInt(t));
  });
  return map;
}

/** Recolors RGBA pixel data in place. Transparent pixels and unmapped colors are left untouched. */
export function recolorPixels(data: Uint8ClampedArray, map: Map<number, number>): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const rgb = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
    const to = map.get(rgb);
    if (to === undefined) continue;
    data[i] = (to >> 16) & 0xff;
    data[i + 1] = (to >> 8) & 0xff;
    data[i + 2] = to & 0xff;
  }
}

/** Which palette a layer needs for this appearance, or null if it is drawn as-is. */
export function layerPalette(recolor: Recolor | undefined, a: Appearance): { material: Material; name: string } | null {
  if (!recolor) return null;
  if (recolor.material === 'body') return { material: 'body', name: a.skin };
  if (recolor.material === 'hair') return { material: 'hair', name: a.hairColor };
  return recolor.palette ? { material: 'cloth', name: recolor.palette } : null;
}
