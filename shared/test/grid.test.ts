import { describe, expect, it } from "vitest";
import { findGridPath, GRID_OBSTACLES, GRID_SIZE } from "../src/grid.js";

describe("findGridPath", () => {
  it("finds a diagonal path on the open grid", () => {
    expect(findGridPath({ column: 2, row: 3 }, { column: 5, row: 6 })).toEqual([
      { column: 2, row: 3 },
      { column: 3, row: 4 },
      { column: 4, row: 5 },
      { column: 5, row: 6 }
    ]);
  });

  it("routes around prototype obstacles", () => {
    const path = findGridPath({ column: 7, row: 8 }, { column: 9, row: 8 }, GRID_OBSTACLES);
    expect(path).not.toBeNull();
    expect(path!.some((point) => point.column === 8 && point.row === 8)).toBe(false);
  });

  it("does not allow diagonal corner cutting", () => {
    expect(findGridPath(
      { column: 0, row: 0 },
      { column: 1, row: 1 },
      [{ column: 1, row: 0 }, { column: 0, row: 1 }]
    )).toBeNull();
  });

  it("rejects out-of-bounds and blocked destinations", () => {
    expect(findGridPath({ column: 0, row: 0 }, { column: GRID_SIZE, row: 0 })).toBeNull();
    expect(findGridPath({ column: 0, row: 0 }, GRID_OBSTACLES[0]!)).toBeNull();
    expect(findGridPath(GRID_OBSTACLES[0]!, { column: 0, row: 0 })).toBeNull();
  });
});