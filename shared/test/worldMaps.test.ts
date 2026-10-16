import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createMapData } from "../src/grid.js";
import { parseWorldRegistry, parseWorldMap, resolveWorldSpawn } from "../src/worldMaps.js";
import { isWorldMapMessage } from "../src/messages.js";
import { PNG_DATA_URL } from "./pngFixture.js";
vi.mock("@guild-to-glory/shared",async()=>import("../src/index.js"));
import { loadWorldMaps } from "../../server/src/worldMaps.js";
const registry = () => JSON.parse(readFileSync(new URL("../../server/maps/registry.json",import.meta.url),"utf8"));

describe("world map foundation",()=>{
  it("loads four actual repository files and the configured starting spawn",()=>{
    const world=loadWorldMaps();
    expect(world.registry.startingMapId).toBe("1-1");
    expect([...world.maps.keys()]).toEqual(["1-1","1-2","2-1","2-2"]);
    expect(world.spawn).toEqual({column:1,row:1});
    for(const entry of world.registry.maps){
      const raw=JSON.parse(readFileSync(new URL("../../server/maps/"+entry.file,import.meta.url),"utf8"));
      expect(world.maps.get(entry.id)).toEqual(raw);
      expect([raw.width,raw.height]).toEqual([20,20]);
    }
    expect(world.maps.get("1-1")!.tiles[6*20+8]).toEqual({textureId:"stone",walkable:false});
  });
  it("rejects duplicate map IDs, file paths, positions and invalid starting IDs",()=>{
    const duplicate=registry();duplicate.maps[1]={...duplicate.maps[0]};
    expect(()=>parseWorldRegistry(duplicate)).toThrow("Duplicate Map ID");
    const file=registry();file.maps[1].file=file.maps[0].file;
    expect(()=>parseWorldRegistry(file)).toThrow("Duplicate map file");
    for(const change of [
      (r:any)=>{r.startingMapId="missing";},
      (r:any)=>{r.maps[0].file="../outside.json";},
      (r:any)=>{r.maps[0].row=3;},
      (r:any)=>{r.maps[0].spawn.column=1.5;},
      (r:any)=>{r.maps.pop();}
    ]){const r=registry();change(r);expect(()=>parseWorldRegistry(r)).toThrow();}
  });
  it("uses a safe fallback for a blocked or out-of-bounds spawn and rejects all-blocked maps",()=>{
    const map=createMapData(2,2,"empty-blocked");
    expect(()=>resolveWorldSpawn(map,{column:0,row:0})).toThrow("no walkable spawn");
    map.tiles[3]!.walkable=true;
    expect(resolveWorldSpawn(map,{column:0,row:0})).toEqual({spawn:{column:1,row:1},fallback:true});
    expect(resolveWorldSpawn(map,{column:500,row:500}).spawn).toEqual({column:1,row:1});
    expect(resolveWorldSpawn(map,{column:1,row:1}).fallback).toBe(false);
  });
  it("accepts editor-exported embedded PNGs and rejects unresolved textures/navigation/dimensions",()=>{
    const map=createMapData(1,1);map.assets=[{id:"image:a",name:"a.png",dataUrl:PNG_DATA_URL}];
    map.tiles[0]!.textureId="image:a";
    expect(parseWorldMap(JSON.parse(JSON.stringify(map)))).toEqual(map);
    map.tiles[0]!.textureId="missing";
    expect(()=>parseWorldMap(map)).toThrow("Unresolved texture");
    expect(()=>parseWorldMap({...map,width:501})).toThrow();
    expect(()=>parseWorldMap({...map,tiles:[{textureId:null,walkable:"yes"}]})).toThrow();
  });
  it("reports missing repository files with context",()=>{
    expect(()=>loadWorldMaps(new URL("../../server/maps/nonexistent/",import.meta.url))).toThrow(/World registry.*registry.json/);
  });
  it("validates authoritative map messages including embedded asset references",()=>{
    expect(isWorldMapMessage({mapId:"1-1",mapName:"Starting",map:createMapData(2,2)})).toBe(true);
    expect(isWorldMapMessage({mapId:"1-1",mapName:"Starting",map:{}})).toBe(false);
    expect(isWorldMapMessage(null)).toBe(false);
    expect(isWorldMapMessage({mapId:"",mapName:"Starting",map:createMapData()})).toBe(false);
  });
});
