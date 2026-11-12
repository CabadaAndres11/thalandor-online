import type { TiledMap } from './collision-map';
import { MONSTERS } from './combat/defs';
import type { SpawnDef } from './world';

const DEFAULT_RESPAWN_MS = 45_000;

interface TiledObject {
  id: number;
  x: number;
  y: number;
  properties?: { name: string; value: unknown }[];
}

/** Monster spawn points from the Tiled object layer "spawns" (properties: monster, count, respawnMs). */
export function spawnsFromTiled(json: TiledMap): SpawnDef[] {
  const layer = json.layers.find((l) => l.name === 'spawns' && l.type === 'objectgroup') as { objects?: TiledObject[] } | undefined;
  const out: SpawnDef[] = [];
  for (const o of layer?.objects ?? []) {
    const prop = (n: string) => o.properties?.find((p) => p.name === n)?.value;
    const monster = prop('monster');
    if (typeof monster !== 'string' || !Object.hasOwn(MONSTERS, monster)) continue;
    const count = prop('count');
    const respawnMs = prop('respawnMs');
    out.push({
      id: o.id,
      monster,
      x: o.x,
      y: o.y,
      count: typeof count === 'number' && count > 0 ? Math.floor(count) : 1,
      respawnMs: typeof respawnMs === 'number' && respawnMs > 0 ? respawnMs : DEFAULT_RESPAWN_MS,
    });
  }
  return out;
}
