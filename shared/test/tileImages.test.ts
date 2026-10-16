import { describe, it, expect } from "vitest";
import { createMapData, cloneMapData, resizeMapData, parseMapImport, isMapData } from "../src/grid.js";
import { parseTileImages, pngDimensions } from "../src/tileImages.js";
import { PNG_DATA_URL } from "./pngFixture.js";
const asset = { id:"image:test",name:"alpha.png",dataUrl:PNG_DATA_URL };

describe("embedded tile images", () => {
  it("round-trips PNG bytes, texture references and independent navigation", () => {
    const map = createMapData(2,1);
    map.assets = [asset]; map.tiles[0] = {textureId:asset.id,walkable:false};
    const result = parseMapImport(JSON.parse(JSON.stringify(map)));
    expect(result.map).toEqual(map); expect(result.warnings).toEqual([]);
    expect(isMapData(result.map)).toBe(true);
    expect(result.map.assets![0]!.dataUrl).toBe(PNG_DATA_URL);
    const clone=cloneMapData(map); clone.assets![0]!.name="different";
    expect(map.assets[0]!.name).toBe("alpha.png");
    expect(resizeMapData(map,3,2).assets).toEqual([asset]);
    expect(resizeMapData(map,3,2).tiles[0]).toEqual(map.tiles[0]);
  });
  it("validates PNG header dimensions", () => {
    const bytes = Uint8Array.from(atob(PNG_DATA_URL.split(",")[1]!),c=>c.charCodeAt(0));
    expect(pngDimensions(bytes)).toEqual({width:64,height:32});
    const huge=bytes.slice(); new DataView(huge.buffer).setUint32(16,2049);
    expect(()=>pngDimensions(huge)).toThrow();
    expect(()=>pngDimensions(new Uint8Array(40))).toThrow();
    expect(()=>pngDimensions(bytes.slice(0,20))).toThrow();
  });
  it.each([
    [{...asset,dataUrl:"https://example.com/tile.png"}],
    [{...asset,dataUrl:"data:image/svg+xml;base64,AAAA"}],
    [{...asset,dataUrl:"data:image/png;base64,AAAA"}],
    [{...asset,dataUrl:"data:image/png;base64,"+"A".repeat(32000)}],
    [{...asset,id:"grass"}], [asset,asset],
    Array.from({length:65},(_,index)=>({...asset,id:"image:"+index})),
    [{...asset,name:42}], [null]
  ])("rejects invalid image registries", assets => {
    expect(()=>parseTileImages(assets)).toThrow();
    const map={...createMapData(1,1),assets};
    expect(()=>parseMapImport(map)).toThrow(); expect(isMapData(map)).toBe(false);
  });
  it("rejects missing embedded images instead of silently losing them", () => {
    const map=createMapData(1,1); map.tiles[0]!.textureId=asset.id;
    expect(()=>parseMapImport(map)).toThrow("Missing embedded PNG");
    expect(isMapData(map)).toBe(false);
  });
  it("keeps old maps without assets compatible", () => {
    expect(parseMapImport(createMapData(1,1)).map.assets).toBeUndefined();
    expect(parseMapImport({width:1,height:1,tiles:[{type:"void"}]}).map.tiles[0]).toEqual({textureId:null,walkable:false});
  });
});
