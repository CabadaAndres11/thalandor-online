import { allLayers, CATALOG, monsterLayers, resolveLayers, type Appearance, type ClassId } from '../../appearance/catalog';
import type { ActionAnim, Anim, LayerRef } from '../../appearance/catalog-types';
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

/** Every character/monster/creature sheet in the catalog, including action animations. */
export function allCharacterSheets(): string[] {
  const set = new Set<string>();
  for (const l of allLayers()) {
    set.add(l.sheet);
    for (const a of Object.values(l.anims ?? {})) set.add(a.sheet);
  }
  for (const c of Object.values(CATALOG.creatures)) set.add(c.sheet);
  return [...set];
}

export function preloadAllSheets(): Promise<HTMLImageElement[]> {
  return Promise.all(allCharacterSheets().map(loadSheet));
}

export function loadedImage(sheet: string): HTMLImageElement | undefined {
  return loaded.get(sheet);
}

export interface ReadyLayer {
  /** Unique per layer + palette; prefix of texture keys. */
  key: string;
  canvas: HTMLCanvasElement;
  zIndex: number;
  /** Ready canvases for each available action animation. */
  anims: Partial<Record<ActionAnim, { canvas: HTMLCanvasElement; frameSize: number }>>;
  actionOnly: boolean;
}

function recolor(sheet: string, pal: ReturnType<typeof layerPalette>): HTMLCanvasElement | null {
  const img = loaded.get(sheet);
  if (!img) return null;
  const key = pal ? `${sheet}|${pal.material}:${pal.name}` : sheet;
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
  return canvas;
}

/** A layer with its palette applied to every animation sheet. The sheets must already be loaded. */
export function readyLayer(layer: LayerRef, a?: Appearance): ReadyLayer | null {
  const pal = layerPalette(layer.recolor, a);
  const canvas = recolor(layer.sheet, pal);
  if (!canvas) return null;
  const anims: ReadyLayer['anims'] = {};
  for (const [anim, s] of Object.entries(layer.anims ?? {}) as [ActionAnim, { sheet: string; frameSize: number }][]) {
    const c = recolor(s.sheet, pal);
    if (c) anims[anim] = { canvas: c, frameSize: s.frameSize };
  }
  const key = pal ? `${layer.sheet}|${pal.material}:${pal.name}` : layer.sheet;
  return { key, canvas, zIndex: layer.zIndex, anims, actionOnly: !!layer.actionOnly };
}

const ready = (layers: LayerRef[], a?: Appearance) => layers.map((l) => readyLayer(l, a)).filter((l): l is ReadyLayer => l !== null);

/** All layers of a player character, back to front, ready to draw (skips sheets not loaded yet). */
export function readyLayers(classId: ClassId, a: Appearance): ReadyLayer[] {
  return ready(resolveLayers(classId, a), a);
}

/** All layers of a humanoid monster look. */
export function readyMonsterLayers(lookId: string): ReadyLayer[] {
  return ready(monsterLayers(lookId));
}

/** Which source to draw for a layer in an animation (walk falls back to the base sheet). */
export function layerSource(layer: ReadyLayer, anim: Anim): { canvas: HTMLCanvasElement; frameSize: number } | null {
  if (anim === 'walk') return layer.actionOnly ? null : { canvas: layer.canvas, frameSize: 64 };
  return layer.anims[anim] ?? null;
}
