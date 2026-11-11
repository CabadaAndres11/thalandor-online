import { TILE_SIZE } from './constants';

export interface TiledLayer {
  name: string;
  type: string;
  data?: number[];
  width?: number;
  height?: number;
}

/** Minimal subset of the Tiled JSON map format that the game reads. */
export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  properties?: { name: string; type?: string; value: unknown }[];
  [extra: string]: unknown;
}

export class CollisionMap {
  constructor(
    readonly widthTiles: number,
    readonly heightTiles: number,
    private readonly solid: Uint8Array,
  ) {
    if (solid.length !== widthTiles * heightTiles) throw new Error('CollisionMap: size mismatch');
  }

  isSolidTile(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.widthTiles || ty >= this.heightTiles) return true;
    return this.solid[ty * this.widthTiles + tx] !== 0;
  }

  isSolidAt(x: number, y: number): boolean {
    return this.isSolidTile(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE));
  }

  static fromTiled(json: TiledMap, layerName = 'collision'): CollisionMap {
    const layer = json.layers.find((l) => l.name === layerName && l.type === 'tilelayer');
    if (!layer?.data) throw new Error(`CollisionMap: layer "${layerName}" not found`);
    return new CollisionMap(json.width, json.height, Uint8Array.from(layer.data, (v) => (v !== 0 ? 1 : 0)));
  }
}
