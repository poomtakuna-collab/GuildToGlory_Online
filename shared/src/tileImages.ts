export interface TileImageAsset {
  id: string;
  name: string;
  dataUrl: string;
}
export const MAX_TILE_IMAGES = 64;
export const MAX_TILE_IMAGE_DATA_LENGTH = 32_000;
export const MAX_SOURCE_PNG_BYTES = 4 * 1024 * 1024;
export const MAX_SOURCE_PNG_DIMENSION = 2048;

/** Check PNG signature and IHDR before asking the browser to decode pixels. */
export function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const signature = [137,80,78,71,13,10,26,10];
  if (bytes.length < 33 || signature.some((byte,index) => bytes[index] !== byte) ||
      bytes[8] !== 0 || bytes[9] !== 0 || bytes[10] !== 0 || bytes[11] !== 13 ||
      String.fromCharCode(...bytes.slice(12,16)) !== "IHDR") throw new Error("Not a PNG image");
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width > MAX_SOURCE_PNG_DIMENSION || height > MAX_SOURCE_PNG_DIMENSION) {
    throw new Error("PNG dimensions must be between 1 and 2048 pixels");
  }
  return { width,height };
}

export function parseTileImages(value: unknown): TileImageAsset[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_TILE_IMAGES) throw new Error("Maximum 64 PNG assets per map");
  const ids = new Set<string>();
  return Array.from(value).map(asset => {
    if (!asset || typeof asset !== "object" || typeof asset.id !== "string" ||
        !/^image:[a-zA-Z0-9-]{1,80}$/.test(asset.id) || ids.has(asset.id) ||
        typeof asset.name !== "string" || !asset.name.length || asset.name.length > 256 ||
        typeof asset.dataUrl !== "string" || asset.dataUrl.length > MAX_TILE_IMAGE_DATA_LENGTH ||
        !/^data:image\/png;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(asset.dataUrl)) {
      throw new Error("Invalid embedded PNG asset");
    }
    const binary = atob(asset.dataUrl.slice("data:image/png;base64,".length));
    const size = pngDimensions(Uint8Array.from(binary,char => char.charCodeAt(0)));
    if (size.width !== 64 || size.height !== 32) throw new Error("Embedded tile PNG must be 64 x 32 pixels");
    ids.add(asset.id);
    return { id: asset.id, name: asset.name, dataUrl: asset.dataUrl };
  });
}
