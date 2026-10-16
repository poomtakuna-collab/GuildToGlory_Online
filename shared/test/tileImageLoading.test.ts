import { afterEach, describe, expect, it, vi } from "vitest";
import { PNG_DATA_URL } from "./pngFixture.js";
const mocks=vi.hoisted(()=>({from:vi.fn(),destroy:vi.fn(),decode:vi.fn()}));
vi.mock("pixi.js",()=>({Texture:{from:mocks.from}}));
vi.mock("@guild-to-glory/shared",async()=>import("../src/index.js"));
import { importPngFile, prepareTileTextures } from "../../client/src/tileImages.js";

function setup() {
  mocks.from.mockReset().mockImplementation(()=>({destroy:mocks.destroy}));
  mocks.destroy.mockReset(); mocks.decode.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("Image",class {
    src=""; naturalWidth=64; naturalHeight=32;
    decode(){return mocks.decode(this.src);}
  });
  const context={beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),closePath:vi.fn(),clip:vi.fn(),drawImage:vi.fn()};
  const canvas={width:0,height:0,getContext:()=>context,toDataURL:()=>PNG_DATA_URL};
  vi.stubGlobal("document",{createElement:()=>canvas});
  const bytes=Uint8Array.from(atob(PNG_DATA_URL.split(",")[1]!),c=>c.charCodeAt(0));
  const file=new File([bytes],"alpha.png",{type:"image/png"});
  return {context,canvas,file};
}
afterEach(()=>vi.unstubAllGlobals());
describe("browser PNG preparation",()=>{
  it("normalizes to a transparent 64x32 diamond and embeds a PNG",async()=>{
    const {context,canvas,file}=setup();
    const asset=await importPngFile(file);
    expect(asset.dataUrl).toBe(PNG_DATA_URL); expect(asset.id).toMatch(/^image:/);
    expect(asset.name).toBe("alpha.png");
    expect([canvas.width,canvas.height]).toEqual([64,32]);
    expect(context.moveTo).toHaveBeenCalledWith(32,0);
    expect(context.lineTo.mock.calls).toEqual([[64,16],[32,32],[0,16]]);
    expect(context.clip).toHaveBeenCalledOnce();
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(),0,0,64,32);
  });
  it("decodes embedded pixels to a reusable Pixi texture",async()=>{
    const {canvas}=setup();
    const result=await prepareTileTextures([{id:"image:a",name:"a.png",dataUrl:PNG_DATA_URL}]);
    expect(result.has("image:a")).toBe(true);
    expect(mocks.decode).toHaveBeenCalledWith(PNG_DATA_URL);
    expect(mocks.from).toHaveBeenCalledWith(canvas);
  });
  it("rejects bad files and oversized sources before decoding",async()=>{
    setup();
    await expect(importPngFile(new File(["not png"],"bad.png"))).rejects.toThrow();
    await expect(importPngFile({name:"huge.png",size:4*1024*1024+1} as File)).rejects.toThrow("4 MB");
    expect(mocks.decode).not.toHaveBeenCalled();
  });
  it("rejects corrupt pixels and frees partial textures if map image decoding fails",async()=>{
    setup(); mocks.decode.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Corrupt PNG"));
    await expect(prepareTileTextures([
      {id:"image:a",name:"a",dataUrl:PNG_DATA_URL},
      {id:"image:b",name:"b",dataUrl:PNG_DATA_URL}
    ])).rejects.toThrow("Corrupt PNG");
    expect(mocks.destroy).toHaveBeenCalledWith(true);
  });
});
