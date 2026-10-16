import { afterEach, describe, expect, it, vi } from "vitest";
import { createMapData, gridToIsometric, resizeMapData } from "../src/grid.js";

// Exercise editor input/state with a small renderer double; this does not test WebGL or browser layout.
vi.mock("pixi.js", () => {
  class Vector {
    x = 0; y = 0;
    set(x: number, y = x) { this.x = x; this.y = y; }
  }
  class Container {
    position = new Vector(); scale = new Vector(); children: Container[] = [];
    constructor() { this.scale.set(1); }
    get x() { return this.position.x; }
    get y() { return this.position.y; }
    addChild(...children: Container[]) { this.children.push(...children); }
    removeChild(child: Container) { this.children.splice(this.children.indexOf(child), 1); }
    toLocal(point: { x: number; y: number }) {
      return { x: (point.x - this.x) / this.scale.x, y: (point.y - this.y) / this.scale.y };
    }
    destroy() {}
  }
  class Graphics extends Container {
    fills = 0; clears = 0; colors: number[] = [];
    clear() { this.fills = 0; this.colors = []; this.clears += 1; return this; }
    moveTo() { return this; } lineTo() { return this; } closePath() { return this; }
    fill(options: {color:number}) { this.fills += 1; this.colors.push(options.color); return this; } stroke() { return this; }
    ellipse() { return this; } circle() { return this; }
  }
  class Sprite extends Container {
    anchor = new Vector(); visible = true; width = 64; height = 32;
    constructor(public texture: unknown) { super(); }
  }
  class Text extends Container { anchor = new Vector(); }
  class Application {
    static latest: Application;
    stage = new Container(); screen = { width: 1000, height: 700 };
    canvas = Object.assign(new EventTarget(), {
      style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 700 }),
      setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() {}
    });
    callbacks: Array<() => void> = [];
    ticker = { deltaMS: 100, add: (callback: () => void) => this.callbacks.push(callback) };
    constructor() { Application.latest = this; }
    async init() {} resize() {}
    tick() { this.callbacks.forEach(callback => callback()); }
  }
  return { Application, Container, Graphics, Text, Sprite };
});
vi.mock("@guild-to-glory/shared", async () => import("../src/index.js"));
import { Application } from "pixi.js";
import { MapEditorView } from "../../client/src/mapEditor.js";

async function setup(width = 5, height = 5, fill: "grass-walkable" | "empty-blocked" = "grass-walkable") {
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("ResizeObserver", class { observe() {} });
  const info = vi.fn(); const message = vi.fn();
  const host = { clientWidth: 1000, clientHeight: 700, replaceChildren() {} } as unknown as HTMLElement;
  const editor = await MapEditorView.create(host, createMapData(width, height, fill), info, message);
  editor.setGridGuideVisible(false);
  const app = (Application as unknown as { latest: any }).latest;
  const scene = app.stage.children[0];
  function pointer(type: string, x: number, y: number, button = 0) {
    const event = Object.assign(new Event(type), { clientX: x, clientY: y, pointerId: 1, button });
    app.canvas.dispatchEvent(event);
  }
  function click(column: number, row: number) {
    const point = gridToIsometric({ column, row }, editor.getMapData().width);
    const x = point.x * scene.scale.x + scene.x;
    const y = point.y * scene.scale.y + scene.y;
    pointer("pointerdown", x, y); pointer("pointerup", x, y);
  }
  return { editor, app, scene, click, pointer, info, message };
}
afterEach(() => vi.unstubAllGlobals());


describe("dual layer editor interactions", () => {
  it("paints texture on blocked cells without changing navigation, then edits navigation independently", async () => {
    const { editor, click, info } = await setup(5,5,"empty-blocked");
    editor.setTool("paint","grass"); click(2,2);
    expect(editor.getMapData().tiles[12]).toEqual({ textureId:"grass",walkable:false });
    expect(info).toHaveBeenLastCalledWith({column:2,row:2},"grass",false);
    editor.setMode("grid"); editor.setTool("walkable"); click(2,2);
    expect(editor.getMapData().tiles[12]).toEqual({ textureId:"grass",walkable:true });
    editor.setMode("texture"); editor.setTool("erase"); click(2,2);
    expect(editor.getMapData().tiles[12]).toEqual({ textureId:null,walkable:true });
    editor.setMode("grid"); editor.setTool("blocked"); click(2,2);
    expect(editor.getMapData().tiles[12]).toEqual({ textureId:null,walkable:false });
  });
  it("does not accept the other mode's tools and does not mutate data when switching/selecting", async () => {
    const { editor, click } = await setup();
    const before = editor.getMapData();
    editor.setTool("blocked"); click(0,0);
    editor.setMode("grid"); editor.setTool("erase"); click(0,0);
    editor.setTool("paint","stone"); click(0,0);
    editor.setMode("texture"); click(0,0);
    editor.setMode("grid"); click(0,0);
    expect(editor.getMapData()).toEqual(before);
  });
  it("picks empty cells accurately after pan and zoom, without painting during pan", async () => {
    const { editor, click, pointer, scene, info } = await setup(5,5,"empty-blocked");
    editor.setTool("paint","stone");
    pointer("pointerdown",500,350,2); pointer("pointermove",650,400,2); pointer("pointerup",650,400,2);
    expect(editor.getMapData().tiles.every(tile => tile.textureId === null)).toBe(true);
    editor.zoom(2,{x:200,y:200}); click(1,3);
    expect(editor.getMapData().tiles[16]).toEqual({textureId:"stone",walkable:false});
    editor.setTool("select"); click(1,2);
    expect(info).toHaveBeenLastCalledWith({column:1,row:2},null,false);
    editor.zoom(100); expect(scene.scale.x).toBe(4);
    editor.zoom(0.001); expect(scene.scale.x).toBe(0.5);
  });
  it("paints continuous drag strokes on each layer independently", async () => {
    const { editor, pointer, scene } = await setup(5,1,"empty-blocked");
    function stroke() {
      const first = gridToIsometric({column:0,row:0},5);
      const last = gridToIsometric({column:4,row:0},5);
      pointer("pointerdown",first.x*scene.scale.x+scene.x,first.y*scene.scale.y+scene.y);
      pointer("pointermove",last.x*scene.scale.x+scene.x,last.y*scene.scale.y+scene.y);
      pointer("pointerup",last.x*scene.scale.x+scene.x,last.y*scene.scale.y+scene.y);
    }
    editor.setTool("paint","dirt"); stroke();
    expect(editor.getMapData().tiles.every(tile => tile.textureId === "dirt" && !tile.walkable)).toBe(true);
    editor.setMode("grid"); editor.setTool("walkable"); stroke();
    expect(editor.getMapData().tiles.every(tile => tile.textureId === "dirt" && tile.walkable)).toBe(true);
    editor.setMode("texture"); editor.setTool("erase"); stroke();
    expect(editor.getMapData().tiles.every(tile => tile.textureId === null && tile.walkable)).toBe(true);
  });
  it("renders navigation independently and forces texture rendering only during Play Test", async () => {
    const { editor, app, scene } = await setup(2,1);
    const map = editor.getMapData();
    map.tiles[0] = {textureId:"grass",walkable:false};
    map.tiles[1] = {textureId:null,walkable:true};
    editor.setMapData(map); app.tick();
    const graphics = scene.children[0];
    expect(graphics.colors).toEqual([0x47795d]);
    editor.setMode("grid"); app.tick();
    expect(graphics.colors).toEqual([0x080b0a,0x398750]);
    expect(editor.startPlayTest()).toBe(true); app.tick();
    expect(graphics.colors).toEqual([0x47795d]);
    editor.stopPlayTest(); app.tick();
    expect(graphics.colors).toEqual([0x080b0a,0x398750]);
    expect(editor.getMapData()).toEqual(map);
  });
  it("uses unsaved navigation, rejects textured blocked targets, locks editing, and preserves both layers", async () => {
    const { editor, click, app, scene, message } = await setup(3,1,"empty-blocked");
    editor.setTool("paint","stone"); click(2,0);
    expect(editor.startPlayTest()).toBe(false);
    editor.setMode("grid"); editor.setTool("walkable"); click(0,0); click(1,0);
    const before = editor.getMapData();
    expect(editor.startPlayTest()).toBe(true);
    editor.setMode("texture"); editor.setTool("erase");
    editor.setMapData(createMapData(10,10));
    click(2,0);
    expect(message).toHaveBeenLastCalledWith("No walkable path to (2, 0)");
    click(0,0);
    for (let tick=0; tick<10; tick+=1) app.tick();
    const expected = gridToIsometric({column:0,row:0},3);
    expect(scene.children[4].position.x).toBeCloseTo(expected.x);
    expect(scene.children[4].position.y).toBeCloseTo(expected.y);
    expect(editor.getMapData()).toEqual(before);
    editor.stopPlayTest();
    expect(editor.getMapData()).toEqual(before);
    click(2,0);
    expect(editor.getMapData().tiles[2]).toEqual({textureId:"stone",walkable:true});
  });
  it("culls 500x500 maps in both modes and reuses geometry on idle frames", async () => {
    const { editor, app, scene, click } = await setup(500,500);
    app.tick();
    const graphics = scene.children[0];
    expect(graphics.fills).toBeGreaterThan(0);
    expect(graphics.fills).toBeLessThan(6000);
    const clears = graphics.clears;
    app.tick(); expect(graphics.clears).toBe(clears);
    editor.setTool("erase"); click(250,250); app.tick();
    expect(graphics.clears).toBe(clears+1);
    editor.setMapData(resizeMapData(editor.getMapData(),1,500)); app.tick();
    expect(editor.getMapData().tiles).toHaveLength(500);
    editor.setMapData(createMapData(500,500,"empty-blocked")); app.tick();
    expect(graphics.fills).toBe(0);
    editor.setMode("grid"); app.tick();
    expect(graphics.fills).toBeGreaterThan(0);
    expect(graphics.fills).toBeLessThan(6000);
  });
});

it("toggles the texture-mode navigation guide without changing either layer or Play Test rendering", async () => {
  const { editor, app, scene } = await setup(2,1);
  const map = editor.getMapData();
  map.tiles[0] = {textureId:"stone",walkable:false};
  map.tiles[1] = {textureId:null,walkable:true};
  editor.setMapData(map); app.tick();
  const colors = () => [...scene.children[0].colors, ...scene.children[3].colors];
  expect(colors()).toEqual([0x78817d]);
  editor.setGridGuideVisible(true); app.tick();
  expect(colors()).toEqual([0x78817d,0x080b0a,0x398750]);
  editor.setMode("grid"); app.tick();
  expect(colors()).toEqual([0x080b0a,0x398750]);
  editor.setMode("texture"); app.tick();
  expect(colors()).toEqual([0x78817d,0x080b0a,0x398750]);
  expect(editor.startPlayTest()).toBe(true); app.tick();
  expect(colors()).toEqual([0x78817d]);
  editor.stopPlayTest(); app.tick();
  expect(colors()).toEqual([0x78817d,0x080b0a,0x398750]);
  editor.setGridGuideVisible(false); app.tick();
  expect(colors()).toEqual([0x78817d]);
  expect(editor.getMapData()).toEqual(map);
});

it("paints image assets, replaces and erases them without changing navigation; restores images in Play Test", async () => {
  const { editor, app, scene, click } = await setup(2,1);
  const texture = { destroy: vi.fn() };
  const asset = { id:"image:test", name:"tile.png", dataUrl:"fixture" };
  editor.addImageAssets([asset],new Map([[asset.id,texture]]) as any);
  editor.setMode("grid"); editor.setTool("blocked"); click(0,0);
  editor.setMode("texture"); editor.setTool("paint",asset.id); click(0,0); app.tick();
  expect(editor.getMapData().tiles[0]).toEqual({textureId:asset.id,walkable:false});
  const sprite = scene.children[2].children[0];
  expect(sprite.texture).toBe(texture);
  expect([sprite.width,sprite.height,sprite.anchor.x,sprite.anchor.y]).toEqual([64,32,0.5,0.5]);
  editor.setMode("grid"); app.tick(); expect(sprite.visible).toBe(false);
  editor.setMode("texture"); app.tick(); expect(sprite.visible).toBe(true);
  expect(editor.startPlayTest()).toBe(true); app.tick(); expect(sprite.visible).toBe(true);
  editor.stopPlayTest();
  editor.setTool("paint","dirt"); click(0,0); app.tick(); expect(sprite.visible).toBe(false);
  expect(editor.getMapData().tiles[0]).toEqual({textureId:"dirt",walkable:false});
  editor.setTool("paint",asset.id); click(0,0);
  editor.setTool("erase"); click(0,0);
  expect(editor.getMapData().tiles[0]).toEqual({textureId:null,walkable:false});
  expect(editor.getMapData().assets).toEqual([asset]);
  editor.setTool("paint",asset.id);
  editor.setMapData(createMapData(2,1));
  click(0,0);
  expect(editor.getMapData().tiles[0]!.textureId).toBe("grass");
  expect(texture.destroy).toHaveBeenCalledWith(true);
});

it("deletes imported images and clears only their textures, with play-test protection", async () => {
  const { editor, click, app } = await setup(3,1);
  const removed = {destroy:vi.fn()}, retained = {destroy:vi.fn()};
  const assets = [{id:"image:a",name:"a",dataUrl:"fixture"},{id:"image:b",name:"b",dataUrl:"fixture"}];
  editor.addImageAssets(assets,new Map([["image:a",removed],["image:b",retained]]) as any);
  editor.setTool("paint","image:a"); click(0,0); click(1,0);
  editor.setTool("paint","image:b"); click(2,0);
  editor.setMode("grid"); editor.setTool("blocked"); click(0,0);
  editor.setMode("texture"); editor.setTool("paint","image:a"); app.tick();
  expect(editor.startPlayTest()).toBe(true);
  expect(()=>editor.removeImageAsset("image:a")).toThrow("Stop Play Test");
  editor.stopPlayTest();
  expect(editor.removeImageAsset("image:a")).toBe(2);
  expect(editor.getMapData().tiles).toEqual([
    {textureId:null,walkable:false},{textureId:null,walkable:true},{textureId:"image:b",walkable:true}
  ]);
  expect(editor.getMapData().assets).toEqual([assets[1]]);
  expect(removed.destroy).toHaveBeenCalledWith(true);
  expect(retained.destroy).not.toHaveBeenCalled();
  click(1,0); expect(editor.getMapData().tiles[1]!.textureId).toBeNull();
  expect(editor.removeImageAsset("image:missing")).toBe(0);
  expect(JSON.stringify(editor.getMapData())).not.toContain("image:a");
});
