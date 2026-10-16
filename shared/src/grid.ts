export const GRID_SIZE = 20;
export const ISO_TILE_WIDTH = 64;
export const ISO_TILE_HEIGHT = 32;

export interface GridPoint {
  column: number;
  row: number;
}

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

function pointKey(point: GridPoint): string {
  return `${point.column},${point.row}`;
}

function isInsideGrid(point: GridPoint): boolean {
  return point.column >= 0 && point.column < GRID_SIZE && point.row >= 0 && point.row < GRID_SIZE;
}

function octileDistance(from: GridPoint, to: GridPoint): number {
  const columnDistance = Math.abs(from.column - to.column);
  const rowDistance = Math.abs(from.row - to.row);
  return Math.max(columnDistance, rowDistance) + (Math.SQRT2 - 1) * Math.min(columnDistance, rowDistance);
}

export function findGridPath(
  start: GridPoint,
  destination: GridPoint,
  obstacles: readonly GridPoint[] = GRID_OBSTACLES
): GridPoint[] | null {
  if (!isInsideGrid(start) || !isInsideGrid(destination)) return null;

  const blocked = new Set(obstacles.map(pointKey));
  if (blocked.has(pointKey(start)) || blocked.has(pointKey(destination))) return null;

  const startKey = pointKey(start);
  const destinationKey = pointKey(destination);
  const open = [start];
  const cameFrom = new Map<string, string>();
  const points = new Map([[startKey, start]]);
  const costFromStart = new Map([[startKey, 0]]);

  while (open.length > 0) {
    let bestIndex = 0;
    for (let index = 1; index < open.length; index += 1) {
      const candidate = open[index]!;
      const best = open[bestIndex]!;
      const candidateCost = costFromStart.get(pointKey(candidate))! + octileDistance(candidate, destination);
      const bestCost = costFromStart.get(pointKey(best))! + octileDistance(best, destination);
      if (candidateCost < bestCost) bestIndex = index;
    }

    const current = open.splice(bestIndex, 1)[0]!;
    const currentKey = pointKey(current);
    if (currentKey === destinationKey) {
      const path = [current];
      let pathKey = currentKey;
      while (cameFrom.has(pathKey)) {
        pathKey = cameFrom.get(pathKey)!;
        path.unshift(points.get(pathKey)!);
      }
      return path;
    }

    for (const direction of DIRECTIONS) {
      const neighbor = { column: current.column + direction.column, row: current.row + direction.row };
      const neighborKey = pointKey(neighbor);
      if (!isInsideGrid(neighbor) || blocked.has(neighborKey)) continue;

      const diagonal = direction.column !== 0 && direction.row !== 0;
      if (diagonal) {
        const horizontal = { column: neighbor.column, row: current.row };
        const vertical = { column: current.column, row: neighbor.row };
        if (blocked.has(pointKey(horizontal)) || blocked.has(pointKey(vertical))) continue;
      }

      const tentativeCost = costFromStart.get(currentKey)! + (diagonal ? Math.SQRT2 : 1);
      if (tentativeCost >= (costFromStart.get(neighborKey) ?? Infinity)) continue;

      cameFrom.set(neighborKey, currentKey);
      points.set(neighborKey, neighbor);
      costFromStart.set(neighborKey, tentativeCost);
      if (!open.some((point) => pointKey(point) === neighborKey)) open.push(neighbor);
    }
  }

  return null;
}