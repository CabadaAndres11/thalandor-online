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

export interface NpcDef {
  role: string;
  name: string;
  x: number;
  y: number;
}

/** Non-player characters from the Tiled object layer "npcs" (property: role). */
export function npcsFromTiled(json: TiledMap): NpcDef[] {
  const layer = json.layers.find((l) => l.name === 'npcs' && l.type === 'objectgroup') as { objects?: (TiledObject & { name?: string })[] } | undefined;
  const out: NpcDef[] = [];
  for (const o of layer?.objects ?? []) {
    const role = o.properties?.find((p) => p.name === 'role')?.value;
    if (typeof role === 'string') out.push({ role, name: o.name ?? role, x: o.x, y: o.y });
  }
  return out;
}
