import { describe, expect, it } from "vitest";
import {
  cloneMapData, createMapData, resizeMapData, parseMapData, parseMapImport,
  findGridPath, getMapTile, getMapPixelSize, gridToIsometric, isometricToGrid,
  isMapData, isTileWalkable, WORLD_MAP, GRID_OBSTACLES
} from "../src/grid.js";

describe("dual layer map schema", () => {
  it.each([[20,20], [50,50], [100,100], [500,500], [1,500], [500,1]])("round-trips both layers at %ix%i", (width, height) => {
    const map = createMapData(width,height);
    map.tiles[0] = { textureId: "stone", walkable: false };
    map.tiles[1] = { textureId: null, walkable: true };
    expect(parseMapData(JSON.parse(JSON.stringify(map)))).toEqual(map);
    expect(isMapData(map)).toBe(true);
  });
  it("creates independent cells for both presets", () => {
    const empty = createMapData(2,2,"empty-blocked");
    expect(empty.tiles).toEqual(Array(4).fill({ textureId: null, walkable: false }));
    empty.tiles[0]!.walkable = true;
    expect(empty.tiles[1]!.walkable).toBe(false);
    expect(createMapData(1,1).tiles[0]).toEqual({ textureId: "grass", walkable: true });
  });
  it.each([0, -1, 501, 1.5, NaN, Infinity])("rejects invalid dimensions %s", size => {
    expect(() => createMapData(size,2)).toThrow();
    expect(() => createMapData(2,size)).toThrow();
    expect(() => resizeMapData(createMapData(),size,2)).toThrow();
  });
  it("preserves both layers on resize, fills empty/blocked, and discards cropped cells", () => {
    const map = createMapData(3,2);
    map.tiles[4] = { textureId: "stone", walkable: false, textureKey: "legacy-stone" };
    map.tiles[5] = { textureId: null, walkable: true };
    const larger = resizeMapData(map,5,4);
    expect(larger.tiles[6]).toEqual(map.tiles[4]);
    expect(larger.tiles[19]).toEqual({ textureId: null, walkable: false });
    larger.tiles[6]!.walkable = true;
    expect(map.tiles[4]!.walkable).toBe(false);
    const smaller = resizeMapData(map,2,2);
    expect(smaller.tiles[3]).toEqual(map.tiles[4]);
    expect(resizeMapData(smaller,3,2).tiles[5]).toEqual({ textureId: null, walkable: false });
  });
  it("clones without sharing mutable cells and leaves the world map isolated", () => {
    const before = JSON.stringify(WORLD_MAP);
    const clone = cloneMapData(WORLD_MAP);
    clone.tiles[0] = { textureId: null, walkable: false };
    clone.tiles[1]!.textureId = "stone";
    expect(JSON.stringify(WORLD_MAP)).toBe(before);
  });
  it("round-trips rectangular map coordinates", () => {
    for (const point of [{ column:0,row:499 },{ column:499,row:0 },{ column:3,row:5 }]) {
      const projected = gridToIsometric(point,500);
      expect(isometricToGrid(projected.x,projected.y,500)).toEqual(point);
    }
    expect(getMapPixelSize({ width:7,height:4 })).toEqual({ width:352,height:208 });
  });
});

describe("import validation and migration", () => {
  it("migrates legacy void and keeps textured blocked tiles intact", () => {
    const result = parseMapImport({ width:5,height:1,tiles:[
      { type:"void",walkable:true }, { type:"grass",walkable:false },
      { type:"dirt",walkable:true }, { type:"stone" }, { type:"void",textureKey:"old-key" }
    ] });
    expect(result.map.tiles).toEqual([
      { textureId:null,walkable:false }, { textureId:"grass",walkable:false },
      { textureId:"dirt",walkable:true }, { textureId:"stone",walkable:true },
      { textureId:null,walkable:false,textureKey:"old-key" }
    ]);
    expect(result.warnings.join(" ")).toContain("Legacy map converted");
    expect(result.warnings.join(" ")).toContain("marked walkable");
    expect(parseMapData(JSON.parse(JSON.stringify(result.map)))).toEqual(result.map);
  });
  it("preserves unknown texture IDs and legacy metadata, and warns on omitted fields", () => {
    const result = parseMapImport({ width:1,height:1,custom:"data",tiles:[
      { textureId:"custom/path",walkable:true,textureKey:"original",extra:"value" }
    ] });
    expect(result.map.tiles[0]).toEqual({ textureId:"custom/path",walkable:true,textureKey:"original" });
    expect(result.warnings).toHaveLength(2);
    expect(parseMapImport(createMapData(1,1)).warnings).toEqual([]);
  });
  it.each([
    null, {}, { width:501,height:1,tiles:[] }, { width:1.5,height:2,tiles:[] },
    { width:1,height:1,tiles:[] }, { width:1,height:1,tiles:[null] },
    { width:1,height:1,tiles:[{ type:"lava" }] },
    { width:1,height:1,tiles:[{ type:["grass"] }] },
    { width:1,height:1,tiles:[{ type:"grass",walkable:"yes" }] },
    { width:1,height:1,tiles:[{ textureId:"grass" }] },
    { width:1,height:1,tiles:[{ textureId:12,walkable:true }] },
    { width:1,height:1,tiles:[{ textureId:"",walkable:true }] },
    { width:1,height:1,tiles:[{ textureId:null,walkable:0 }] },
    { width:1,height:1,tiles:[{ textureId:null,walkable:false,textureKey:12 }] },
    { width:1,height:1,tiles:[{ textureId:"x".repeat(257),walkable:true }] },
    { schemaVersion:3,width:1,height:1,tiles:[{ textureId:null,walkable:false }] },
    { schemaVersion:2,width:1,height:1,tiles:[{ type:"grass" }] }
  ])("rejects malformed data without changing the source", value => {
    const before = JSON.stringify(value);
    expect(() => parseMapData(value)).toThrow();
    expect(JSON.stringify(value)).toBe(before);
    expect(isMapData(value)).toBe(false);
  });
  it("rejects sparse arrays", () => {
    const value = { schemaVersion:2,width:1,height:1,tiles:new Array(1) };
    expect(isMapData(value)).toBe(false);
    expect(() => parseMapData(value)).toThrow();
  });
});

describe("navigation grid pathfinding", () => {
  it("walks on empty textures and rejects textured blocked cells", () => {
    const map = createMapData(3,1,"empty-blocked");
    map.tiles.forEach(tile => { tile.walkable = true; });
    expect(findGridPath({column:0,row:0},{column:2,row:0},map)).toHaveLength(3);
    map.tiles[1] = { textureId:"grass",walkable:false };
    expect(findGridPath({column:0,row:0},{column:2,row:0},map)).toBeNull();
    expect(findGridPath({column:0,row:0},{column:1,row:0},map)).toBeNull();
  });
  it("prevents diagonal corner cutting regardless of texture", () => {
    const map = createMapData(2,2);
    map.tiles[1]!.walkable = false;
    map.tiles[2]!.walkable = false;
    expect(findGridPath({column:0,row:0},{column:1,row:1},map)).toBeNull();
  });
  it("preserves world obstacle routing and open diagonal paths", () => {
    expect(findGridPath({column:2,row:3},{column:5,row:6})).toHaveLength(4);
    expect(findGridPath({column:0,row:0},GRID_OBSTACLES[0]!)).toBeNull();
    const path = findGridPath({column:7,row:8},{column:9,row:8})!;
    expect(path.every(point => isTileWalkable(getMapTile(WORLD_MAP,point)))).toBe(true);
    expect(path.some(point => point.column === 8 && point.row === 8)).toBe(false);
  });
  it("handles maximum size and unreachable destinations", () => {
    const map = createMapData(500,500);
    expect(findGridPath({column:0,row:0},{column:499,row:499},map)).toHaveLength(500);
    for (let row=0; row<500; row+=1) map.tiles[row*500+250]!.walkable = false;
    expect(findGridPath({column:0,row:0},{column:499,row:499},map)).toBeNull();
  });
  it("handles invalid coordinates, blocked spawn, and identical endpoints", () => {
    const point = {column:0,row:0};
    expect(findGridPath(point,point,createMapData(1,1))).toEqual([point]);
    expect(findGridPath(point,point,createMapData(1,1,"empty-blocked"))).toBeNull();
    for (const column of [NaN,Infinity,-1,0.5,500]) {
      expect(getMapTile(WORLD_MAP,{column,row:0})).toBeUndefined();
      expect(findGridPath({column,row:0},point)).toBeNull();
    }
  });
});
