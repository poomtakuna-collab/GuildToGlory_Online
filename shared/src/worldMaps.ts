import { getMapTile, isTileWalkable, parseMapData, type GridPoint, type MapData } from "./grid.js";

export interface WorldMapEntry {
  id: string;
  name: string;
  file: string;
  row: number;
  column: number;
  spawn: GridPoint;
}
export interface WorldRegistry { startingMapId: string; maps: WorldMapEntry[] }

export function parseWorldRegistry(value: unknown): WorldRegistry {
  const registry = value as WorldRegistry | null;
  if (!registry || typeof registry.startingMapId !== "string" || !Array.isArray(registry.maps) || registry.maps.length !== 4) {
    throw new Error("World registry must contain four maps and a startingMapId");
  }
  const ids = new Set<string>(), positions = new Set<string>(), files = new Set<string>();
  const maps = registry.maps.map(entry => {
    if (!entry || typeof entry.id !== "string" || !/^[12]-[12]$/.test(entry.id) ||
        typeof entry.name !== "string" || !entry.name.trim() ||
        typeof entry.file !== "string" || !/^[a-zA-Z0-9_-]+\.json$/.test(entry.file) ||
        ![1,2].includes(entry.row) || ![1,2].includes(entry.column) || entry.id !== `${entry.row}-${entry.column}` ||
        !entry.spawn || !Number.isInteger(entry.spawn.column) || !Number.isInteger(entry.spawn.row)) {
      throw new Error("Invalid world map entry: expected ID/position in 2x2, local JSON filename and integer spawn");
    }
    if (ids.has(entry.id)) throw new Error(`Duplicate Map ID: ${entry.id}`);
    if (positions.has(`${entry.row},${entry.column}`)) throw new Error("Duplicate world position");
    if (files.has(entry.file)) throw new Error("Duplicate map file reference");
    ids.add(entry.id); positions.add(`${entry.row},${entry.column}`); files.add(entry.file);
    return { id:entry.id,name:entry.name,file:entry.file,row:entry.row,column:entry.column,spawn:{...entry.spawn} };
  });
  if (ids.size !== 4) throw new Error("World registry must contain all four map IDs");
  if (registry.startingMapId !== "1-1" || !ids.has(registry.startingMapId)) throw new Error("Starting map must be 1-1");
  return { startingMapId:registry.startingMapId, maps };
}

/** World files reject unresolved textures instead of drawing a silent placeholder. */
export function parseWorldMap(value: unknown): MapData {
  const map = parseMapData(value);
  const ids = new Set(["grass","dirt","stone",...(map.assets ?? []).map(asset => asset.id)]);
  for (const tile of map.tiles) {
    if (tile.textureId !== null && !ids.has(tile.textureId)) throw new Error(`Unresolved texture reference: ${tile.textureId}`);
  }
  return map;
}

export function resolveWorldSpawn(map: MapData, requested: GridPoint): { spawn: GridPoint; fallback: boolean } {
  if (isTileWalkable(getMapTile(map,requested))) return {spawn:{...requested},fallback:false};
  const index = map.tiles.findIndex(isTileWalkable);
  if (index < 0) throw new Error("Map has no walkable spawn tile");
  return {spawn:{column:index%map.width,row:Math.floor(index/map.width)},fallback:true};
}
