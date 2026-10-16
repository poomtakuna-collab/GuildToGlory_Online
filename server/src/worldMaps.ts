import { readFileSync } from "node:fs";
import { parseWorldRegistry, parseWorldMap, resolveWorldSpawn, type MapData, type GridPoint, type WorldRegistry } from "@guild-to-glory/shared";

export interface LoadedWorld {
  registry: WorldRegistry;
  maps: Map<string, MapData>;
  spawn: GridPoint;
}
// Both src/worldMaps.ts and dist/worldMaps.js resolve to server/maps, independent of cwd.
export function loadWorldMaps(directory = new URL("../maps/", import.meta.url)): LoadedWorld {
  const read = (file: string): unknown => {
    try { return JSON.parse(readFileSync(new URL(file,directory),"utf8").replace(/^\uFEFF/,"")); }
    catch (error) { throw new Error(`World map file ${file}: ${error instanceof Error ? error.message : String(error)}`); }
  };
  let registry: WorldRegistry;
  try { registry = parseWorldRegistry(read("registry.json")); }
  catch (error) { throw new Error(`World registry: ${error instanceof Error ? error.message : String(error)}`); }
  const maps = new Map<string,MapData>();
  let spawn: GridPoint | undefined;
  for (const entry of registry.maps) {
    try {
      const map = parseWorldMap(read(entry.file));
      const resolved = resolveWorldSpawn(map,entry.spawn);
      if (resolved.fallback) console.warn(`Map ${entry.id}: configured spawn unavailable; using (${resolved.spawn.column}, ${resolved.spawn.row})`);
      maps.set(entry.id,map);
      if (entry.id === registry.startingMapId) spawn = resolved.spawn;
    } catch (error) {
      throw new Error(`Map ${entry.id} (${entry.file}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {registry,maps,spawn:spawn!};
}
let loaded: LoadedWorld | undefined;
export function getWorldMaps(): LoadedWorld { return loaded ??= loadWorldMaps(); }
