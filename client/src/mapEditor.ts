import { prepareTileTextures } from "./tileImages.js";
import { Application, Container, Graphics, Text, Sprite, type Texture } from "pixi.js";
import {
  cloneMapData,
  getTextureColor,
  isTileWalkable,
  findGridPath,
  getMapPixelSize,
  getMapTile,
  gridToIsometric,
  isometricToGrid,
  ISO_TILE_HEIGHT,
  ISO_TILE_WIDTH,
  type GridPoint,
  type MapData,
  type MapTextureId
} from "@guild-to-glory/shared";

export type EditorTool = "select" | "paint" | "erase" | "walkable" | "blocked";
export type EditorMode = "texture" | "grid";

const ORIGIN_Y = 24;
interface LocalPlayer {
  container: Container;
  x: number;
  y: number;
  path: GridPoint[];
  pathIndex: number;
}

export class MapEditorView {
  private readonly app: Application;
  private readonly scene = new Container();
  private readonly mapLayer = new Graphics();
  private readonly highlight = new Graphics();
  private readonly imageLayer = new Container();
  private readonly guideLayer = new Graphics();
  private readonly imageSprites: Sprite[] = [];
  private textures = new Map<string, Texture>();
  private map: MapData;
  private mode: EditorMode = "texture";
  private gridGuideVisible = true;
  private tool: EditorTool = "select";
  private paintType: MapTextureId = "grass";
  private drawing = false;
  private lastPainted = "";
  private isPlaying = false;
  private localPlayer?: LocalPlayer;
  private dirty = true;
  private activePointer?: number;
  private panPoint?: { x: number; y: number };
  private lastStrokePoint?: GridPoint;

  private constructor(
    app: Application,
    host: HTMLElement,
    map: MapData,
    private readonly onTileInfo: (point: GridPoint, type: MapTextureId, walkable: boolean) => void,
    private readonly onMessage: (message: string) => void
  ) {
    this.app = app;
    this.map = cloneMapData(map);
    this.scene.sortableChildren = true;
    this.mapLayer.zIndex = -2;
    this.highlight.zIndex = -1;
    this.imageLayer.zIndex = -1.8;
    this.guideLayer.zIndex = -1.5;
    this.scene.addChild(this.mapLayer, this.highlight, this.imageLayer, this.guideLayer);
    this.scene.eventMode = "none";
    app.stage.addChild(this.scene);
    const canvas = app.canvas;
    const coordinates = (event: MouseEvent) => {
      const bounds = canvas.getBoundingClientRect();
      return { x: (event.clientX - bounds.left) * app.screen.width / bounds.width,
        y: (event.clientY - bounds.top) * app.screen.height / bounds.height };
    };
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    canvas.addEventListener("pointerdown", (event) => {
      if (this.activePointer !== undefined) return;
      this.activePointer = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      const point = coordinates(event);
      if (event.button === 1 || event.button === 2 || event.shiftKey) {
        this.panPoint = point;
        canvas.style.cursor = "grabbing";
      } else if (event.button === 0) this.handlePointerDown(point.x, point.y);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (this.activePointer !== undefined && event.pointerId !== this.activePointer) return;
      const point = coordinates(event);
      if (this.panPoint) {
        this.scene.position.x += point.x - this.panPoint.x;
        this.scene.position.y += point.y - this.panPoint.y;
        this.panPoint = point;
        this.highlight.clear();
        this.dirty = true;
      } else this.handlePointerMove(point.x, point.y);
    });
    const release = (event: PointerEvent) => {
      if (event.pointerId !== this.activePointer) return;
      this.activePointer = undefined;
      this.panPoint = undefined;
      this.finishStroke();
      canvas.style.cursor = "crosshair";
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("lostpointercapture", release);
    canvas.addEventListener("pointerleave", () => this.highlight.clear());
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const point = coordinates(event);
      this.zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.003), point);
    }, { passive: false });
    new ResizeObserver(() => { app.resize(); this.dirty = true; }).observe(host);
    app.ticker.add(() => {
      if (this.dirty && host.clientWidth > 0 && host.clientHeight > 0) {
        this.drawMap();
        this.dirty = false;
      }
      this.updateLocalPlayer();
    });
    this.resetCamera();
  }

  static async create(
    host: HTMLElement,
    map: MapData,
    onTileInfo: (point: GridPoint, type: MapTextureId, walkable: boolean) => void,
    onMessage: (message: string) => void
  ): Promise<MapEditorView> {
    const app = new Application();
    await app.init({
      background: "#172c24",
      antialias: true,
      resizeTo: host,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    });
    app.canvas.style.touchAction = "none";
    app.canvas.style.cursor = "crosshair";
    host.replaceChildren(app.canvas);
    const view = new MapEditorView(app, host, map, onTileInfo, onMessage);
    try {
      if (map.assets?.length) view.setMapData(map, await prepareTileTextures(map.assets));
      return view;
    } catch (error) {
      app.destroy(true, { children: true });
      throw error;
    }
  }

  getMapData(): MapData {
    return cloneMapData(this.map);
  }

  setMapData(map: MapData, textures?: Map<string, Texture>): void {
    if (this.isPlaying) return;
    for (const asset of map.assets ?? []) {
      if (!(textures ?? this.textures).has(asset.id)) throw new Error("PNG texture must be decoded before loading the map");
    }
    // Clear sprite references before releasing old GPU textures.
    for (const sprite of this.imageSprites) sprite.destroy();
    this.imageSprites.length = 0;
    const nextTextures = textures ?? new Map([...this.textures].filter(([id]) => map.assets?.some(asset => asset.id === id)));
    for (const [id, texture] of this.textures) {
      if (nextTextures.get(id) !== texture) texture.destroy(true);
    }
    this.textures = nextTextures;
    this.tool = "select";
    this.paintType = "grass";
    this.map = cloneMapData(map);
    this.finishStroke();
    this.highlight.clear();
    this.resetCamera();
    this.onMessage(`Loaded ${map.width} x ${map.height} map`);
  }

  addImageAssets(assets: NonNullable<MapData["assets"]>, textures: Map<string, Texture>): void {
    if (this.isPlaying) throw new Error("Stop Play Test before importing images");
    this.map.assets = [...(this.map.assets ?? []), ...assets];
    for (const [id, texture] of textures) this.textures.set(id, texture);
    this.dirty = true;
  }

  removeImageAsset(id: string): number {
    if (this.isPlaying) throw new Error("Stop Play Test before deleting images");
    if (!this.map.assets?.some(asset => asset.id === id)) return 0;
    this.finishStroke();
    let cleared = 0;
    for (const tile of this.map.tiles) {
      if (tile.textureId === id) { tile.textureId = null; cleared += 1; }
    }
    this.map.assets = this.map.assets.filter(asset => asset.id !== id);
    for (const sprite of this.imageSprites) sprite.destroy();
    this.imageSprites.length = 0;
    this.textures.get(id)?.destroy(true);
    this.textures.delete(id);
    this.tool = "select";
    this.paintType = "grass";
    this.highlight.clear();
    this.dirty = true;
    return cleared;
  }

  setGridGuideVisible(visible: boolean): void {
    this.gridGuideVisible = visible;
    this.dirty = true;
  }

  setMode(mode: EditorMode): void {
    if (this.isPlaying) return;
    this.finishStroke();
    this.mode = mode;
    this.tool = "select";
    this.highlight.clear();
    this.dirty = true;
  }

  setTool(tool: EditorTool, paintType: MapTextureId = this.paintType): void {
    if (this.isPlaying) return;
    this.finishStroke();
    this.tool = tool;
    this.paintType = paintType;
  }

  startPlayTest(): boolean {
    if (this.isPlaying) return false;
    const center = { column: (this.map.width - 1) / 2, row: (this.map.height - 1) / 2 };
    let spawn: GridPoint | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let row = 0; row < this.map.height; row += 1) {
      for (let column = 0; column < this.map.width; column += 1) {
        const point = { column, row };
        if (!isTileWalkable(getMapTile(this.map, point))) continue;
        const distance = Math.hypot(column - center.column, row - center.row);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          spawn = point;
        }
      }
    }
    if (!spawn) {
      this.onMessage("Play Test unavailable: map has no walkable tiles");
      return false;
    }

    this.isPlaying = true;
    this.finishStroke();
    this.localPlayer = {
      container: this.createPlayer(),
      x: spawn.column,
      y: spawn.row,
      path: [],
      pathIndex: 0
    };
    const position = gridToIsometric(spawn, this.map.width, ORIGIN_Y);
    this.localPlayer.container.position.set(position.x, position.y);
    this.localPlayer.container.zIndex = Math.round(spawn.column + spawn.row) + 1;
    this.scene.addChild(this.localPlayer.container);
    this.scene.position.set(this.app.screen.width / 2 - position.x * this.scene.scale.x,
      this.app.screen.height / 2 - position.y * this.scene.scale.y);
    this.dirty = true;
    this.onMessage(`Play Test started at (${spawn.column}, ${spawn.row})`);
    return true;
  }

  stopPlayTest(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.localPlayer) {
      this.scene.removeChild(this.localPlayer.container);
      this.localPlayer.container.destroy({ children: true });
    }
    this.localPlayer = undefined;
    this.finishStroke();
    this.dirty = true;
    this.onMessage("Play Test stopped. Map edits are preserved.");
  }

  private drawMap(): void {
    this.mapLayer.clear();
    this.guideLayer.clear();
    let imageCount = 0;
    for (const sprite of this.imageSprites) sprite.visible = false;
    // Inverse-project viewport corners; only visit the bounded visible grid range.
    const corners = [[0, 0], [this.app.screen.width, 0], [0, this.app.screen.height],
      [this.app.screen.width, this.app.screen.height]].map(([x, y]) => {
      const local = this.scene.toLocal({ x: x!, y: y! });
      return isometricToGrid(local.x, local.y, this.map.width, ORIGIN_Y);
    });
    const minColumn = Math.max(0, Math.min(...corners.map(p => p.column)) - 2);
    const maxColumn = Math.min(this.map.width - 1, Math.max(...corners.map(p => p.column)) + 2);
    const minRow = Math.max(0, Math.min(...corners.map(p => p.row)) - 2);
    const maxRow = Math.min(this.map.height - 1, Math.max(...corners.map(p => p.row)) + 2);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const tile = getMapTile(this.map, { column, row })!;
        const { x, y } = gridToIsometric({ column, row }, this.map.width, ORIGIN_Y);
        const screenX = x * this.scene.scale.x + this.scene.x;
        const screenY = y * this.scene.scale.y + this.scene.y;
        const margin = ISO_TILE_WIDTH * this.scene.scale.x;
        if (screenX < -margin || screenY < -margin ||
            screenX > this.app.screen.width + margin || screenY > this.app.screen.height + margin) continue;
        if (this.mode === "grid" && !this.isPlaying) {
          this.drawDiamond(this.mapLayer, x, y, tile.walkable ? 0x398750 : 0x080b0a, 1, true);
        } else if (tile.textureId !== null) {
          const texture = this.textures.get(tile.textureId);
          if (texture) {
            let sprite = this.imageSprites[imageCount];
            if (!sprite) {
              sprite = new Sprite(texture);
              this.imageSprites.push(sprite);
              this.imageLayer.addChild(sprite);
            }
            sprite.texture = texture;
            sprite.anchor.set(0.5);
            sprite.position.set(x, y);
            sprite.width = ISO_TILE_WIDTH; sprite.height = ISO_TILE_HEIGHT;
            sprite.visible = true;
            imageCount += 1;
            if (!this.isPlaying) this.drawDiamond(this.guideLayer, x, y, 0, 0);
          } else this.drawDiamond(this.mapLayer, x, y, getTextureColor(tile.textureId));
        } else if (!this.isPlaying) {
          // Empty cells retain a grid outline for selection but have no texture fill.
          this.mapLayer.moveTo(x, y - ISO_TILE_HEIGHT / 2).lineTo(x + ISO_TILE_WIDTH / 2, y)
            .lineTo(x, y + ISO_TILE_HEIGHT / 2).lineTo(x - ISO_TILE_WIDTH / 2, y).closePath()
            .stroke({ color: 0x647c68, alpha: 0.35, width: 1 });
        }
        if (this.mode === "texture" && !this.isPlaying && this.gridGuideVisible) {
          this.drawDiamond(this.guideLayer, x, y, tile.walkable ? 0x398750 : 0x080b0a, 0.22, true);
        }
      }
    }
    // An outline makes the editable bounds discoverable even for an entirely empty map.
    const top = gridToIsometric({ column: -0.5, row: -0.5 }, this.map.width);
    const right = gridToIsometric({ column: this.map.width - 0.5, row: -0.5 }, this.map.width);
    const bottom = gridToIsometric({ column: this.map.width - 0.5, row: this.map.height - 0.5 }, this.map.width);
    const left = gridToIsometric({ column: -0.5, row: this.map.height - 0.5 }, this.map.width);
    this.mapLayer.moveTo(top.x, top.y).lineTo(right.x, right.y).lineTo(bottom.x, bottom.y)
      .lineTo(left.x, left.y).closePath().stroke({ color: 0xd9bb76, width: 1 / this.scene.scale.x });
  }

  private drawDiamond(graphics: Graphics, x: number, y: number, color: number, alpha = 1, grid = false): void {
    graphics.moveTo(x, y - ISO_TILE_HEIGHT / 2)
      .lineTo(x + ISO_TILE_WIDTH / 2, y)
      .lineTo(x, y + ISO_TILE_HEIGHT / 2)
      .lineTo(x - ISO_TILE_WIDTH / 2, y)
      .closePath()
      .fill({ color, alpha })
      .stroke({ color: grid ? "#819187" : "#182f26", alpha: grid ? Math.min(0.88, alpha) : 0.88, width: 1.15 });
  }

  private createPlayer(): Container {
    const container = new Container();
    const character = new Graphics();
    character.ellipse(0, 0, 12, 7).fill({ color: 0xe5bd69 })
      .stroke({ color: "#f2eddc", alpha: 0.9, width: 2 });
    character.circle(0, -10, 5).fill({ color: "#f2eddc" });
    const name = new Text({
      text: "Play Test",
      style: { fill: "#f2eddc", fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: "600" }
    });
    name.anchor.set(0.5, 1);
    name.position.set(0, -19);
    container.addChild(character, name);
    return container;
  }

  private handlePointerDown(screenX: number, screenY: number): void {
    const point = this.getPoint(screenX, screenY);
    if (!point) return;
    this.drawing = true;
    this.lastPainted = "";
    if (this.isPlaying) {
      this.moveLocalPlayer(point);
      return;
    }
    this.applyTool(point);
    this.lastStrokePoint = point;
  }

  private handlePointerMove(screenX: number, screenY: number): void {
    const point = this.getPoint(screenX, screenY);
    if (!point) {
      this.highlight.clear();
      this.lastStrokePoint = undefined;
      return;
    }
    const position = gridToIsometric(point, this.map.width, ORIGIN_Y);
    this.highlight.clear();
    this.drawDiamond(this.highlight, position.x, position.y, 0xf0cc73, 0.28);
    if (!this.drawing || this.isPlaying || this.tool === "select") return;
    const start = this.lastStrokePoint ?? point;
    const steps = Math.max(Math.abs(point.column - start.column), Math.abs(point.row - start.row));
    for (let step = 1; step <= steps; step += 1) {
      this.applyTool({ column: Math.round(start.column + (point.column - start.column) * step / steps),
        row: Math.round(start.row + (point.row - start.row) * step / steps) });
    }
    this.applyTool(point);
    this.lastStrokePoint = point;
  }

  private getPoint(screenX: number, screenY: number): GridPoint | undefined {
    const local = this.scene.toLocal({ x: screenX, y: screenY });
    const point = isometricToGrid(local.x, local.y, this.map.width, ORIGIN_Y);
    return getMapTile(this.map, point) ? point : undefined;
  }

  private applyTool(point: GridPoint): void {
    const key = `${point.column},${point.row}`;
    const tile = getMapTile(this.map, point)!;
    if (this.tool === "select") {
      this.onTileInfo(point, tile.textureId, isTileWalkable(tile));
      this.onMessage(`Selected (${point.column}, ${point.row})`);
      return;
    }
    if (key === this.lastPainted) return;
    this.lastPainted = key;
    if (this.mode === "texture") {
      if (this.tool === "paint") tile.textureId = this.paintType;
      if (this.tool === "erase") tile.textureId = null;
    } else {
      if (this.tool === "walkable") tile.walkable = true;
      if (this.tool === "blocked") tile.walkable = false;
    }
    this.onTileInfo(point, tile.textureId, isTileWalkable(tile));
    this.dirty = true;
  }

  private moveLocalPlayer(destination: GridPoint): void {
    if (!this.localPlayer) return;
    const start = this.localPlayer.path[this.localPlayer.pathIndex] ??
      { column: Math.round(this.localPlayer.x), row: Math.round(this.localPlayer.y) };
    const path = findGridPath(start, destination, this.map);
    if (!path) {
      this.onMessage(`No walkable path to (${destination.column}, ${destination.row})`);
      return;
    }
    this.localPlayer.path = path;
    this.localPlayer.pathIndex = 0;
    this.onMessage(`Moving to (${destination.column}, ${destination.row})`);
  }

  private updateLocalPlayer(): void {
    if (!this.localPlayer || !this.isPlaying) return;
    let remaining = 4.5 * Math.min(this.app.ticker.deltaMS, 100) / 1000;
    while (remaining > 0 && this.localPlayer.pathIndex < this.localPlayer.path.length) {
      const target = this.localPlayer.path[this.localPlayer.pathIndex]!;
      const dx = target.column - this.localPlayer.x;
      const dy = target.row - this.localPlayer.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.0001) {
        this.localPlayer.x = target.column;
        this.localPlayer.y = target.row;
        this.localPlayer.pathIndex += 1;
        continue;
      }
      const travel = Math.min(remaining, distance);
      this.localPlayer.x += dx / distance * travel;
      this.localPlayer.y += dy / distance * travel;
      remaining -= travel;
      if (travel === distance) this.localPlayer.pathIndex += 1;
    }

    const position = gridToIsometric(
      { column: this.localPlayer.x, row: this.localPlayer.y },
      this.map.width,
      ORIGIN_Y
    );
    this.localPlayer.container.position.set(position.x, position.y);
    this.localPlayer.container.zIndex = Math.round(this.localPlayer.x + this.localPlayer.y) + 1;
  }

  private finishStroke(): void {
    this.drawing = false;
    this.lastPainted = "";
    this.lastStrokePoint = undefined;
  }

  zoom(factor: number, anchor = { x: this.app.screen.width / 2, y: this.app.screen.height / 2 }): void {
    const local = this.scene.toLocal(anchor);
    const scale = Math.max(0.5, Math.min(4, this.scene.scale.x * factor));
    this.scene.scale.set(scale);
    this.scene.position.set(anchor.x - local.x * scale, anchor.y - local.y * scale);
    this.highlight.clear();
    this.dirty = true;
  }

  resetCamera(): void {
    const size = getMapPixelSize(this.map);
    const scale = Math.max(0.5, Math.min(1, this.app.screen.width / size.width, this.app.screen.height / size.height));
    const center = gridToIsometric({ column: (this.map.width - 1) / 2, row: (this.map.height - 1) / 2 }, this.map.width);
    this.scene.scale.set(scale);
    this.scene.position.set(this.app.screen.width / 2 - center.x * scale, this.app.screen.height / 2 - center.y * scale);
    this.highlight.clear();
    this.dirty = true;
  }
}
