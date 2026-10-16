import { Texture } from "pixi.js";
import { MAX_SOURCE_PNG_BYTES, pngDimensions, parseTileImages, type TileImageAsset } from "@guild-to-glory/shared";

async function decodePng(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return image;
}

/** Normalize once, preserving alpha and fitting/clipping into the ground diamond. */
export async function importPngFile(file: File): Promise<TileImageAsset> {
  if (file.size > MAX_SOURCE_PNG_BYTES) throw new Error(file.name + ": maximum source size is 4 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  pngDimensions(bytes);
  const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
  try {
    const image = await decodePng(url);
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 32;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.beginPath();
    context.moveTo(32,0); context.lineTo(64,16); context.lineTo(32,32); context.lineTo(0,16);
    context.closePath(); context.clip();
    context.drawImage(image,0,0,64,32);
    const asset = { id: "image:" + crypto.randomUUID(), name: file.name.slice(0,256) || "Tile PNG", dataUrl: canvas.toDataURL("image/png") };
    return parseTileImages([asset])[0]!;
  } finally { URL.revokeObjectURL(url); }
}

/** Decode every image before replacing the current map. A broken PNG aborts the load. */
export async function prepareTileTextures(assets: readonly TileImageAsset[]): Promise<Map<string, Texture>> {
  const textures = new Map<string, Texture>();
  try {
    for (const asset of assets) {
      const image = await decodePng(asset.dataUrl);
      if (image.naturalWidth !== 64 || image.naturalHeight !== 32) throw new Error("Invalid tile image dimensions");
      // Clip on load too, so external map files cannot draw outside the ground cell.
      const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 32;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.beginPath(); context.moveTo(32,0); context.lineTo(64,16); context.lineTo(32,32); context.lineTo(0,16);
      context.closePath(); context.clip(); context.drawImage(image,0,0);
      textures.set(asset.id, Texture.from(canvas));
    }
    return textures;
  } catch (error) {
    for (const texture of textures.values()) texture.destroy(true);
    throw error;
  }
}
