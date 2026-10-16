import { parseTileImages, type TileImageAsset } from "./tileImages.js";
export const GRID_SIZE = 20;
export const ISO_TILE_WIDTH = 64;
export const ISO_TILE_HEIGHT = 32;

export interface GridPoint {
  column: number;
  row: number;
}

export type MapTextureId = string | null;
export type NewMapPreset = "empty-blocked" | "grass-walkable";

export interface MapTileData {
  textureId: MapTextureId;
  walkable: boolean;
  /** Preserved legacy metadata; PNG assets use textureId. */
  textureKey?: string;
}

export interface MapData {
  schemaVersion: 2;
  width: number;
  height: number;
  tiles: MapTileData[];
  assets?: TileImageAsset[];
}

export const MAX_MAP_DIMENSION = 500;

export const GRID_OBSTACLES: readonly GridPoint[] = [
  { column: 8, row: 6 },
  { column: 8, row: 7 },
  { column: 8, row: 8 },
  { column: 8, row: 9 },
  { column: 8, row: 10 },
  { column: 8, row: 11 },
  { column: 11, row: 8 },
  { column: 12, row: 8 },
  { column: 13, row: 8 },
  { column: 5, row: 13 },
  { column: 6, row: 13 },
  { column: 7, row: 13 },
  { column: 14, row: 5 }
];

export function createMapData(width = GRID_SIZE, height = GRID_SIZE, preset: NewMapPreset = "grass-walkable"): MapData {
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 1 || height < 1 || width > MAX_MAP_DIMENSION || height > MAX_MAP_DIMENSION) {
    throw new RangeError(`Map dimensions must be integers from 1 to ${MAX_MAP_DIMENSION}`);
  }

  return {
    schemaVersion: 2,
    width,
    height,
    tiles: Array.from({ length: width * height }, () => ({
      textureId: preset === "grass-walkable" ? "grass" : null,
      walkable: preset === "grass-walkable"
    }))
  };
}

export function cloneMapData(map: MapData): MapData {
  return { schemaVersion: 2, width: map.width, height: map.height, tiles: map.tiles.map((tile) => ({ ...tile })),
    ...(map.assets ? { assets: map.assets.map(asset => ({ ...asset })) } : {}) };
}

export function isMapData(value: unknown): value is MapData {
  if (!isRecord(value) || value.schemaVersion !== 2 || !validDimensions(value.width, value.height) ||
      !Array.isArray(value.tiles) || value.tiles.length !== Number(value.width) * Number(value.height)) return false;
  for (const tile of value.tiles) {
    if (!isRecord(tile) || !validTexture(tile.textureId) || typeof tile.walkable !== "boolean" ||
        ("textureKey" in tile && !validKey(tile.textureKey))) return false;
  }
  try {
    const assets = parseTileImages(value.assets);
    return value.tiles.every(tile => !tile.textureId?.startsWith("image:") || assets.some(asset => asset.id === tile.textureId));
  } catch { return false; }
}

export function getMapTile(map: MapData, point: GridPoint): MapTileData | undefined {
  if (!Number.isInteger(point.column) || !Number.isInteger(point.row)) return undefined;
  if (point.column < 0 || point.column >= map.width || point.row < 0 || point.row >= map.height) return undefined;
  return map.tiles[point.row * map.width + point.column];
}

export function getMapPixelSize(map: Pick<MapData, "width" | "height">): { width: number; height: number } {
  return { width: (map.width + map.height) * ISO_TILE_WIDTH / 2, height: (map.width + map.height) * ISO_TILE_HEIGHT / 2 + 32 };
}

export function gridToIsometric(point: GridPoint, mapWidth: number, originY = 24): { x: number; y: number } {
  return {
    x: mapWidth * ISO_TILE_WIDTH / 2 + (point.column - point.row) * ISO_TILE_WIDTH / 2,
    y: originY + (point.column + point.row) * ISO_TILE_HEIGHT / 2
  };
}

export function isometricToGrid(x: number, y: number, mapWidth: number, originY = 24): GridPoint {
  const deltaX = x - mapWidth * ISO_TILE_WIDTH / 2;
  const deltaY = y - originY;
  return {
    column: Math.round(deltaX / ISO_TILE_WIDTH + deltaY / ISO_TILE_HEIGHT),
    row: Math.round(deltaY / ISO_TILE_HEIGHT - deltaX / ISO_TILE_WIDTH)
  };
}

export const WORLD_MAP: MapData = (() => {
  const map = createMapData();
  for (const obstacle of GRID_OBSTACLES) {
    map.tiles[obstacle.row * map.width + obstacle.column] = { textureId: null, walkable: false };
  }
  return map;
})();

const DIRECTIONS = [
  { column: 1, row: 0 },
  { column: -1, row: 0 },
  { column: 0, row: 1 },
  { column: 0, row: -1 },
  { column: 1, row: 1 },
  { column: 1, row: -1 },
  { column: -1, row: 1 },
  { column: -1, row: -1 }
] as const;


export function isTileWalkable(tile: MapTileData | undefined): boolean {
  return tile?.walkable === true;
}

/** Preserve the top-left overlap, fill new cells with empty/blocked, discard cropped cells. */
export function resizeMapData(map: MapData, width: number, height: number): MapData {
  const resized = createMapData(width, height, "empty-blocked");
  if (map.assets) resized.assets = map.assets.map(asset => ({ ...asset }));
  for (let row = 0; row < Math.min(height, map.height); row += 1) {
    for (let column = 0; column < Math.min(width, map.width); column += 1) {
      resized.tiles[row * width + column] = { ...map.tiles[row * map.width + column]! };
    }
  }
  return resized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validKey(value: unknown): value is string {
  return typeof value === "string" && value.length <= 256;
}
function validTexture(value: unknown): value is MapTextureId {
  return value === null || (validKey(value) && value.length > 0);
}
function validDimensions(width: unknown, height: unknown): boolean {
  return typeof width === "number" && typeof height === "number" &&
    Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1 &&
    width <= MAX_MAP_DIMENSION && height <= MAX_MAP_DIMENSION;
}

export interface MapImportResult { map: MapData; warnings: string[] }

/** No mutation until validation completes; callers show warnings before replacing an editor map. */
export function parseMapImport(value: unknown): MapImportResult {
  if (!isRecord(value) || !validDimensions(value.width, value.height) || !Array.isArray(value.tiles) ||
      value.tiles.length !== Number(value.width) * Number(value.height)) {
    throw new Error("Map needs dimensions 1-500 and exactly width * height tiles");
  }
  if (value.schemaVersion !== undefined && value.schemaVersion !== 2) throw new Error("Unsupported map schemaVersion");
  const assets = parseTileImages(value.assets);
  const assetIds = new Set(assets.map(asset => asset.id));
  const warnings = new Set<string>();
  const warnExtra = (record: Record<string, unknown>, keys: string[]) => {
    if (Object.keys(record).some(key => !keys.includes(key))) {
      warnings.add("Unrecognized fields will be omitted. Keep the original JSON as a backup.");
    }
  };
  warnExtra(value, ["schemaVersion", "width", "height", "tiles", "assets"]);
  if (Array.isArray(value.assets)) {
    for (const asset of value.assets) warnExtra(asset, ["id", "name", "dataUrl"]);
  }
  const tiles: MapTileData[] = [];
  for (const tile of value.tiles) {
    if (!isRecord(tile) || ("textureKey" in tile && !validKey(tile.textureKey))) throw new Error("Invalid tile or textureKey");
    let textureId: MapTextureId;
    let walkable: boolean;
    if ("textureId" in tile) {
      if (!validTexture(tile.textureId) || typeof tile.walkable !== "boolean") throw new Error("Each tile needs textureId and boolean walkable");
      textureId = tile.textureId;
      walkable = tile.walkable;
      warnExtra(tile, ["textureId", "walkable", "textureKey"]);
    } else {
      if (value.schemaVersion === 2 || typeof tile.type !== "string" || !["grass", "dirt", "stone", "void"].includes(tile.type) ||
          ("walkable" in tile && typeof tile.walkable !== "boolean")) throw new Error("Invalid legacy tile");
      textureId = tile.type === "void" ? null : tile.type as string;
      walkable = tile.type === "void" ? false : (tile.walkable as boolean | undefined) ?? true;
      warnings.add("Legacy map converted to independent texture/navigation layers. Void becomes Empty + Blocked; existing terrain and walkability are preserved.");
      if (tile.type === "void" && tile.walkable === true) warnings.add("Legacy void tiles marked walkable are converted to Blocked, matching legacy void rules.");
      warnExtra(tile, ["type", "walkable", "textureKey"]);
    }
    if (textureId?.startsWith("image:") && !assetIds.has(textureId)) throw new Error("Missing embedded PNG for " + textureId);
    if (textureId !== null && !assetIds.has(textureId) && !["grass", "dirt", "stone"].includes(textureId)) {
      warnings.add("Unknown texture IDs are preserved and shown with a gray placeholder.");
    }
    tiles.push({ textureId, walkable, ...(tile.textureKey !== undefined ? { textureKey: tile.textureKey as string } : {}) });
  }
  return { map: { schemaVersion: 2, width: value.width as number, height: value.height as number, tiles, ...(value.assets !== undefined ? { assets } : {}) }, warnings: [...warnings] };
}

export function parseMapData(value: unknown): MapData {
  return parseMapImport(value).map;
}

/** Shared placeholder palette for the editor and multiplayer world. */
export function getTextureColor(textureId: string): number {
  switch (textureId) {
    case "grass": return 0x47795d;
    case "dirt": return 0x8c6747;
    case "stone": return 0x78817d;
    default: return 0x777777;
  }
}

function octileDistance(from: GridPoint, to: GridPoint): number {
  const dx = Math.abs(from.column - to.column);
  const dy = Math.abs(from.row - to.row);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

/** Binary min-heap avoids scanning the entire A* frontier on large maps. */
class PathHeap {
  private entries: Array<{ index: number; cost: number; score: number }> = [];
  get length(): number { return this.entries.length; }
  push(entry: { index: number; cost: number; score: number }): void {
    let position = this.entries.length;
    this.entries.push(entry);
    while (position > 0) {
      const parent = (position - 1) >> 1;
      if (this.entries[parent]!.score <= entry.score) break;
      this.entries[position] = this.entries[parent]!;
      position = parent;
    }
    this.entries[position] = entry;
  }
  pop(): { index: number; cost: number; score: number } {
    const first = this.entries[0]!;
    const last = this.entries.pop()!;
    if (this.entries.length) {
      let position = 0;
      while (position * 2 + 1 < this.entries.length) {
        let child = position * 2 + 1;
        if (child + 1 < this.entries.length && this.entries[child + 1]!.score < this.entries[child]!.score) child += 1;
        if (this.entries[child]!.score >= last.score) break;
        this.entries[position] = this.entries[child]!;
        position = child;
      }
      this.entries[position] = last;
    }
    return first;
  }
}

export function findGridPath(start: GridPoint, destination: GridPoint, map: MapData = WORLD_MAP): GridPoint[] | null {
  if (!isTileWalkable(getMapTile(map, start)) || !isTileWalkable(getMapTile(map, destination))) return null;
  const startIndex = start.row * map.width + start.column;
  const targetIndex = destination.row * map.width + destination.column;
  const costs = new Float64Array(map.tiles.length).fill(Infinity);
  const parents = new Int32Array(map.tiles.length).fill(-1);
  const closed = new Uint8Array(map.tiles.length);
  const open = new PathHeap();
  costs[startIndex] = 0;
  open.push({ index: startIndex, cost: 0, score: octileDistance(start, destination) });
  while (open.length) {
    const entry = open.pop();
    const index = entry.index;
    if (closed[index] || entry.cost !== costs[index]) continue;
    if (index === targetIndex) {
      const path: GridPoint[] = [];
      for (let cursor = index; cursor !== -1; cursor = parents[cursor]!) {
        path.push({ column: cursor % map.width, row: Math.floor(cursor / map.width) });
      }
      return path.reverse();
    }
    closed[index] = 1;
    const current = { column: index % map.width, row: Math.floor(index / map.width) };
    for (const direction of DIRECTIONS) {
      const next = { column: current.column + direction.column, row: current.row + direction.row };
      if (!isTileWalkable(getMapTile(map, next))) continue;
      const nextIndex = next.row * map.width + next.column;
      if (closed[nextIndex]) continue;
      const diagonal = direction.column !== 0 && direction.row !== 0;
      if (diagonal && (!isTileWalkable(getMapTile(map, { column: next.column, row: current.row })) ||
          !isTileWalkable(getMapTile(map, { column: current.column, row: next.row })))) continue;
      const cost = entry.cost + (diagonal ? Math.SQRT2 : 1);
      if (cost >= costs[nextIndex]!) continue;
      costs[nextIndex] = cost;
      parents[nextIndex] = index;
      open.push({ index: nextIndex, cost, score: cost + octileDistance(next, destination) });
    }
  }
  return null;
}
