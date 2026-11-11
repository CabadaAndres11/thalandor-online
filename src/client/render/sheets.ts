import { CATALOG, resolveLayers, type Appearance, type ClassId } from '../../appearance/catalog';
import type { LayerRef } from '../../appearance/catalog-types';
import { buildColorMap, layerPalette, recolorPixels } from '../../appearance/recolor';

/** Sheet paths are relative to public/; BASE_URL keeps them working under the GitHub Pages subpath. */
export const sheetUrl = (sheet: string) => `${import.meta.env.BASE_URL}${sheet}`;

const images = new Map<string, Promise<HTMLImageElement>>();
const loaded = new Map<string, HTMLImageElement>();
const recolored = new Map<string, HTMLCanvasElement>();

export function loadSheet(sheet: string): Promise<HTMLImageElement> {
  let p = images.get(sheet);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        loaded.set(sheet, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`No se pudo cargar ${sheet}`));
      img.src = sheetUrl(sheet);
    });
    images.set(sheet, p);
  }
  return p;
}

/** Every character sheet in the catalog. */
export function allCharacterSheets(): string[] {
  const set = new Set<string>();
  for (const ls of Object.values(CATALOG.layers.body)) for (const l of ls) set.add(l.sheet);
  for (const l of Object.values(CATALOG.layers.hair)) set.add(l.sheet);
  for (const byBody of Object.values(CATALOG.layers.outfit)) for (const ls of Object.values(byBody)) for (const l of ls) set.add(l.sheet);
  return [...set];
}

export function preloadAllSheets(): Promise<HTMLImageElement[]> {
  return Promise.all(allCharacterSheets().map(loadSheet));
}

export interface ReadyLayer {
  /** Unique per sheet + palette; usable as a texture key. */
  key: string;
  canvas: HTMLCanvasElement;
  zIndex: number;
}

/** A layer drawn with its palette applied. The sheet must already be loaded. */
export function readyLayer(layer: LayerRef, a: Appearance): ReadyLayer | null {
  const img = loaded.get(layer.sheet);
  if (!img) return null;
  const pal = layerPalette(layer.recolor, a);
  const key = pal ? `${layer.sheet}|${pal.material}:${pal.name}` : layer.sheet;
  let canvas = recolored.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const set = pal ? CATALOG.palettes[pal.material] : undefined;
    const target = pal && set?.colors[pal.name];
    if (set && target) {
      const data = g.getImageData(0, 0, canvas.width, canvas.height);
      recolorPixels(data.data, buildColorMap(set.base, target));
      g.putImageData(data, 0, 0);
    }
    recolored.set(key, canvas);
  }
  return { key, canvas, zIndex: layer.zIndex };
}

/** All layers of a character, back to front, ready to draw (skips any sheet not loaded yet). */
export function readyLayers(classId: ClassId, a: Appearance): ReadyLayer[] {
  return resolveLayers(classId, a)
    .map((l) => readyLayer(l, a))
    .filter((l): l is ReadyLayer => l !== null);
}
