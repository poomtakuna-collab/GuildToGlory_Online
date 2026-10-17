import { createGuildApi } from "./guildApi.js";
import { browserGuestAccount } from "./guestAccount.js";
import { loadLocalProfile, LOCAL_PROFILE_STORAGE_KEY } from "./localProfile.js";
import { GUILD_STORAGE_KEY } from "./guildStorage.js";
import { createPartySync } from "./partySync.js";
import type { PartyStateMessage, PartyResultMessage } from "@guild-to-glory/shared";
import { setupGuildSection } from "./guildSection.js";
import { Client, type Room } from "colyseus.js";
import { Application, Container, Graphics, Rectangle, Text, Sprite, type Texture } from "pixi.js";
import { importPngFile, prepareTileTextures } from "./tileImages.js";
import { MapEditorView, type EditorTool, type EditorMode } from "./mapEditor.js";
import {
  ADVENTURER_STAT_KEYS,
  MAX_TILE_IMAGES,
  type TileImageAsset,
  cloneMapData,
  ISO_TILE_HEIGHT,
  ISO_TILE_WIDTH,
  createMapData,
  resizeMapData,
  parseMapImport,
  getTextureColor,
  isTileWalkable,
  NETWORK_MESSAGES,
  RARITY_CONFIG,
  ROOM_NAME,
  WORLD_MAP,
  generateAdventurer,
  getMapPixelSize,
  getMapTile,
  gridToIsometric,
  isometricToGrid,
  isWorldStateMessage,
  isWorldMapMessage,
  type WorldMapMessage,
  type AdventurerStat,
  type GeneratedAdventurer,
  type GridPoint,
  type MapData,
  type MapTextureId,
  type NewMapPreset,
  type PingMessage,
  type PongMessage,
  type TraitDefinition,
  type WorldPlayer,
  type WorldStateMessage
} from "@guild-to-glory/shared";
import "./style.css";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
type SectionName = "menu" | "world" | "editor" | "adventurers" | "guild";

const serverUrl = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";
const guestAccount=browserGuestAccount(serverUrl);
const connectButton = document.querySelector<HTMLButtonElement>("#connect-button")!;
const connectLabel = document.querySelector<HTMLSpanElement>("#connect-label")!;
const statusLabel = document.querySelector<HTMLParagraphElement>("#connection-status")!;
const detailLabel = document.querySelector<HTMLParagraphElement>("#connection-detail")!;
const statusIndicator = document.querySelector<HTMLSpanElement>("#status-indicator")!;
const serverAddress = document.querySelector<HTMLSpanElement>("#server-address")!;
const worldServerAddress = document.querySelector<HTMLSpanElement>("#server-address-world")!;
const roundTripTime = document.querySelector<HTMLSpanElement>("#round-trip-time")!;
const worldRoot = document.querySelector<HTMLDivElement>("#pixi-root")!;
const sections: Record<SectionName, HTMLElement> = {
  guild: document.querySelector<HTMLElement>("#guild-section")!,
  menu: document.querySelector<HTMLElement>("#menu-section")!,
  world: document.querySelector<HTMLElement>("#world-section")!,
  editor: document.querySelector<HTMLElement>("#editor-section")!,
  adventurers: document.querySelector<HTMLElement>("#adventurers-section")!
};
const guildApi=createGuildApi(serverUrl,guestAccount,()=>window.sessionStorage);
const refreshGuild = setupGuildSection(sections.guild,guildApi);
const navigationButtons = document.querySelectorAll<HTMLButtonElement>("[data-section]");
const worldInfo = document.querySelector<HTMLDivElement>("#world-info")!;
const partySummary = document.querySelector<HTMLElement>("#world-party-summary")!;
const partySyncStatus = document.querySelector<HTMLElement>("#party-sync-status")!;
let partySync: ReturnType<typeof createPartySync> | undefined;
const stopPartySync = () => { partySync?.stop(); partySync=undefined; partySummary.replaceChildren(); partySyncStatus.textContent=""; };
document.querySelector("#sync-party")!.addEventListener("click",()=>partySync?.sync());
window.addEventListener("storage",event=>{
  if(event.key===GUILD_STORAGE_KEY || event.key===LOCAL_PROFILE_STORAGE_KEY || event.key===null) partySync?.sync();
});
const playerCount = document.querySelector<HTMLSpanElement>("#player-count")!;
const editorRoot = document.querySelector<HTMLDivElement>("#map-editor-root")!;
const editorStatus = document.querySelector<HTMLParagraphElement>("#editor-status")!;
const editorTestStatus = document.querySelector<HTMLParagraphElement>("#editor-test-status")!;
const editorTilePosition = document.querySelector<HTMLElement>("#editor-tile-position")!;
const editorTileType = document.querySelector<HTMLElement>("#editor-tile-type")!;
const editorTileWalkable = document.querySelector<HTMLElement>("#editor-tile-walkable")!;
const editorToolButtons = document.querySelectorAll<HTMLButtonElement>("[data-editor-tool]");
const editorModeButtons = document.querySelectorAll<HTMLButtonElement>("[data-editor-mode]");
const textureTools = document.querySelector<HTMLElement>("#texture-tools")!;
const gridTools = document.querySelector<HTMLElement>("#grid-tools")!;
const gridGuideControl = document.querySelector<HTMLElement>("#grid-guide-control")!;
const gridGuideToggle = document.querySelector<HTMLInputElement>("#grid-guide-toggle")!;
const imageAssetPanel = document.querySelector<HTMLElement>("#image-asset-panel")!;
const importPngButton = document.querySelector<HTMLButtonElement>("#import-png-button")!;
const importPngInput = document.querySelector<HTMLInputElement>("#import-png-input")!;
const assetPalette = document.querySelector<HTMLElement>("#asset-palette")!;
let editorAssets: TileImageAsset[] = [];
const editorModeHint = document.querySelector<HTMLElement>("#editor-mode-hint")!;
const newMapPreset = document.querySelector<HTMLSelectElement>("#new-map-preset")!;
let editorMode: EditorMode = "texture";
const importMapButton = document.querySelector<HTMLButtonElement>("#import-map-button")!;
const importMapInput = document.querySelector<HTMLInputElement>("#import-map-input")!;
const exportMapButton = document.querySelector<HTMLButtonElement>("#export-map-button")!;
const playTestButton = document.querySelector<HTMLButtonElement>("#playtest-button")!;
const stopTestButton = document.querySelector<HTMLButtonElement>("#stoptest-button")!;
const mapWidthInput = document.querySelector<HTMLInputElement>("#map-width")!;
const mapHeightInput = document.querySelector<HTMLInputElement>("#map-height")!;
const newMapButton = document.querySelector<HTMLButtonElement>("#new-map-button")!;
const resizeMapButton = document.querySelector<HTMLButtonElement>("#resize-map-button")!;
const mapSizeLabel = document.querySelector<HTMLElement>("#map-size")!;
let mapImportPending = false;
const generateButton = document.querySelector<HTMLButtonElement>("#generate-button")!;
const adventurerName = document.querySelector<HTMLHeadingElement>("#adventurer-name")!;
const adventurerRarity = document.querySelector<HTMLSpanElement>("#adventurer-rarity")!;
const adventurerLevel = document.querySelector<HTMLElement>("#adventurer-level")!;
const startingSkillsList = document.querySelector<HTMLUListElement>("#starting-skills-list")!;
const traitList = document.querySelector<HTMLUListElement>("#trait-list")!;
const statValues: Record<AdventurerStat, HTMLElement> = {
  STR: document.querySelector<HTMLElement>("#stat-str")!,
  AGI: document.querySelector<HTMLElement>("#stat-agi")!,
  VIT: document.querySelector<HTMLElement>("#stat-vit")!,
  DEX: document.querySelector<HTMLElement>("#stat-dex")!,
  INT: document.querySelector<HTMLElement>("#stat-int")!,
  LUK: document.querySelector<HTMLElement>("#stat-luk")!
};

const client = new Client(serverUrl);
let activeRoom: Room | undefined;
let worldViewPromise: Promise<WorldView> | undefined;
let mapEditorViewPromise: Promise<MapEditorView> | undefined;
const editorMapData: MapData = cloneMapData(WORLD_MAP);
let editorPlayTestActive = false;
let currentSection: SectionName = "menu";
let connectionAttempt = 0;
let status: ConnectionStatus = "disconnected";
const statusNames: Record<ConnectionStatus, string> = {
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error"
};

serverAddress.textContent = serverUrl;
worldServerAddress.textContent = serverUrl;

function displayAdventurer(adventurer: GeneratedAdventurer): void {
  adventurerName.textContent = adventurer.name;
  adventurerRarity.style.setProperty("--rarity-color", adventurer.rarity.colorHex);
  adventurerName.style.setProperty("--rarity-color", adventurer.rarity.colorHex);
  adventurerRarity.textContent = "★".repeat(Math.max(1, RARITY_CONFIG.findIndex((rarity) => rarity.name === adventurer.rarity.name) + 1));
  adventurerRarity.setAttribute("aria-label", `${adventurer.rarity.name} rarity`);
  adventurerRarity.title = `${adventurer.rarity.name} rarity`;
  adventurerLevel.textContent = String(adventurer.level);

  for (const stat of ADVENTURER_STAT_KEYS) {
    statValues[stat].textContent = String(adventurer.baseStats[stat]);
  }

  startingSkillsList.replaceChildren(...adventurer.startingSkills.map((skill) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const tier = document.createElement("span");
    item.className = "skill-entry";
    name.className = "skill-name";
    name.textContent = skill.name;
    tier.className = "skill-tier";
    tier.textContent = `Tier ${skill.tier}`;
    item.append(name, tier);
    return item;
  }));

  if (adventurer.traits.length === 0) {
    const emptyMessage = document.createElement("li");
    emptyMessage.className = "trait-empty";
    emptyMessage.textContent = "No Traits";
    traitList.replaceChildren(emptyMessage);
    return;
  }

  traitList.replaceChildren(...adventurer.traits.map((trait: TraitDefinition) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const effects = document.createElement("span");
    item.className = `trait-item trait-${trait.type}`;
    name.className = "trait-name";
    name.textContent = trait.name;
    effects.className = "trait-effects";
    effects.textContent = trait.effects.map((effect) => effect.description).join(" · ");
    item.append(name, effects);
    return item;
  }));
}

generateButton.addEventListener("click", () => displayAdventurer(generateAdventurer()));
displayAdventurer(generateAdventurer());

interface PlayerVisual {
  container: Container;
  targetX: number;
  targetY: number;
}

const MAP_ORIGIN_Y = 24;

function drawDiamond(graphics: Graphics, x: number, y: number, fill: number, alpha = 1): void {
  graphics.moveTo(x, y - ISO_TILE_HEIGHT / 2)
    .lineTo(x + ISO_TILE_WIDTH / 2, y)
    .lineTo(x, y + ISO_TILE_HEIGHT / 2)
    .lineTo(x - ISO_TILE_WIDTH / 2, y)
    .closePath()
    .fill({ color: fill, alpha })
    .stroke({ color: "#182f26", alpha: 0.88, width: 1.15 });
}

class WorldView {
  private readonly app: Application;
  private map = createMapData(1,1,"empty-blocked");
  private ready = false;
  private textures = new Map<string,Texture>();
  private readonly images = new Container();
  private readonly scene = new Container();
  private readonly players = new Map<string, PlayerVisual>();
  private readonly mapLayer = new Graphics();
  private readonly selection = new Graphics();

  constructor(app: Application, private readonly onDestination: (destination: GridPoint) => void) {
    this.app = app;

    this.mapLayer.zIndex = -2;
    this.selection.zIndex = -1;
    this.images.zIndex = -1.8;
    this.scene.addChild(this.mapLayer, this.images, this.selection);
    this.scene.sortableChildren = true;
    this.scene.eventMode = "static";

    this.scene.on("pointerdown", (event) => this.selectTile(event.global.x, event.global.y));
    app.stage.addChild(this.scene);
    this.layout();
    app.renderer.on("resize", () => this.layout());
    app.ticker.add(() => this.interpolatePlayers());
  }

  clearMap(): void {
    this.setWorldState({players:[]});
    this.ready = false;
    this.mapLayer.clear(); this.selection.clear();
    for (const child of this.images.removeChildren()) child.destroy();
    for (const texture of this.textures.values()) texture.destroy(true);
    this.textures.clear();
  }

  setMapData(map: MapData, textures: Map<string,Texture>): void {
    this.clearMap();
    this.map = map; this.textures = textures; this.ready = true;
    const size = getMapPixelSize(map);
    this.scene.hitArea = new Rectangle((map.width-map.height)*ISO_TILE_WIDTH/2,0,size.width,size.height);
    this.drawMap(); this.layout();
  }

  private project(point: GridPoint): {x:number;y:number} {
    return gridToIsometric(point,this.map.width,MAP_ORIGIN_Y);
  }

  setWorldState(state: WorldStateMessage, localPlayerId?: string): void {
    if (!this.ready && state.players.length) return;
    const seenPlayers = new Set<string>();

    for (const player of state.players) {
      seenPlayers.add(player.id);
      let visual = this.players.get(player.id);
      if (!visual) {
        visual = this.createPlayer(player);
        this.players.set(player.id, visual);
        this.scene.addChild(visual.container);
      }

      const position = this.project({ column: player.x, row: player.y });
      visual.targetX = position.x;
      visual.targetY = position.y;
      visual.container.zIndex = Math.round(player.x + player.y);
      visual.container.label = player.id === localPlayerId ? "You" : player.name;
    }

    for (const [playerId, visual] of this.players) {
      if (seenPlayers.has(playerId)) continue;
      this.scene.removeChild(visual.container);
      visual.container.destroy({ children: true });
      this.players.delete(playerId);
    }
  }

  private drawMap(): void {
    for (let depth = 0; depth < this.map.width + this.map.height - 1; depth += 1) {
      const firstColumn = Math.max(0, depth - this.map.height + 1);
      const lastColumn = Math.min(this.map.width - 1, depth);
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        this.drawTile(column, depth - column);
      }
    }
  }

  private drawTile(column: number, row: number): void {
    const tileData = getMapTile(this.map, { column, row })!;
    const { x, y } = this.project({ column, row });
    if (tileData.textureId === null) return;
    const texture = this.textures.get(tileData.textureId);
    if (texture) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5); sprite.position.set(x,y);
      sprite.width = ISO_TILE_WIDTH; sprite.height = ISO_TILE_HEIGHT;
      this.images.addChild(sprite);
    } else drawDiamond(this.mapLayer,x,y,getTextureColor(tileData.textureId));
  }

  private createPlayer(player: WorldPlayer): PlayerVisual {
    const container = new Container();
    const character = new Graphics();
    character.ellipse(0, 0, 12, 7).fill({ color: player.color })
      .stroke({ color: "#f2eddc", alpha: 0.9, width: 2 });
    character.circle(0, -10, 5).fill({ color: "#f2eddc" });
    const name = new Text({
      text: player.name,
      style: { fill: "#f2eddc", fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: "600" }
    });
    name.anchor.set(0.5, 1);
    name.position.set(0, -19);
    container.addChild(character, name);
    const position = this.project({ column: player.x, row: player.y });
    container.position.set(position.x, position.y);
    return { container, targetX: position.x, targetY: position.y };
  }

  private selectTile(screenX: number, screenY: number): void {
    if (!this.ready) return;
    const local = this.scene.toLocal({ x: screenX, y: screenY });
    const destination = isometricToGrid(local.x, local.y, this.map.width, MAP_ORIGIN_Y);
    const tile = getMapTile(this.map, destination);
    if (!isTileWalkable(tile)) return;

    this.selection.clear();
    const { x, y } = this.project(destination);
    drawDiamond(this.selection, x, y, 0xf0cc73, 0.42);
    this.onDestination(destination);
  }

  private layout(): void {
    if (!this.ready) return;
    const size = getMapPixelSize(this.map);
    const scale = Math.min(this.app.screen.width/size.width,this.app.screen.height/size.height);
    const center = this.project({column:(this.map.width-1)/2,row:(this.map.height-1)/2});
    this.scene.scale.set(scale);
    this.scene.position.set(this.app.screen.width/2-center.x*scale,this.app.screen.height/2-center.y*scale);
  }

  private interpolatePlayers(): void {
    const amount = Math.min(1, this.app.ticker.deltaMS / 100);
    for (const visual of this.players.values()) {
      visual.container.x += (visual.targetX - visual.container.x) * amount;
      visual.container.y += (visual.targetY - visual.container.y) * amount;
    }
  }
}

function setStatus(nextStatus: ConnectionStatus, detail: string): void {
  status = nextStatus;
  statusLabel.textContent = statusNames[nextStatus];
  detailLabel.textContent = detail;
  statusIndicator.dataset.status = nextStatus;
  connectLabel.textContent = {
    connecting: "Connecting...",
    connected: "Disconnect",
    disconnected: "Connect to server",
    error: "Try again"
  }[nextStatus];
  connectButton.disabled = nextStatus === "connecting";
}

function resetWorld(view: WorldView): void {
  document.querySelector<HTMLElement>("#guest-player-id")!.textContent="";
  view.clearMap();
  playerCount.textContent = "0 players";
  worldInfo.hidden = true;
}

async function ensureWorldView(): Promise<WorldView> {
  if (!worldViewPromise) worldViewPromise = createWorldView();
  return worldViewPromise;
}

async function ensureMapEditorView(): Promise<MapEditorView> {
  if (!mapEditorViewPromise) {
    mapEditorViewPromise = MapEditorView.create(editorRoot, editorMapData, (point, type, walkable) => {
      editorTilePosition.textContent = `${point.column}, ${point.row}`;
      editorTileType.textContent = type === null ? "Empty" : editorAssets.find(asset => asset.id === type)?.name ?? type[0]!.toUpperCase() + type.slice(1);
      editorTileWalkable.textContent = walkable ? "Walkable" : "Blocked";
    }, (message) => {
      editorStatus.textContent = message;
    });
  }
  return mapEditorViewPromise;
}

function updateEditorTestControls(isPlaying: boolean): void {
  editorPlayTestActive = isPlaying;
  editorToolButtons.forEach((button) => { button.disabled = isPlaying || mapImportPending; });
  editorModeButtons.forEach((button) => { button.disabled = isPlaying || mapImportPending; });
  newMapPreset.disabled = isPlaying || mapImportPending;
  imageAssetPanel.hidden = editorMode !== "texture";
  importPngButton.disabled = isPlaying || mapImportPending;
  exportMapButton.disabled = mapImportPending;
  assetPalette.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = isPlaying || mapImportPending; });
  gridGuideControl.hidden = editorMode !== "texture" || isPlaying;
  gridGuideToggle.disabled = isPlaying || mapImportPending;
  editorModeHint.textContent = isPlaying ? "Play Test displays textures; navigation controls movement." :
    editorMode === "texture" ? "Texture only. Empty does not change walkability." : "Green: Walkable. Black: Blocked. Textures stay unchanged.";
  importMapButton.disabled = isPlaying || mapImportPending;
  newMapButton.disabled = isPlaying || mapImportPending;
  resizeMapButton.disabled = isPlaying || mapImportPending;
  mapWidthInput.disabled = isPlaying || mapImportPending;
  mapHeightInput.disabled = isPlaying || mapImportPending;
  playTestButton.disabled = mapImportPending;
  playTestButton.hidden = isPlaying;
  stopTestButton.hidden = !isPlaying;
  stopTestButton.disabled = !isPlaying;
  editorTestStatus.textContent = isPlaying ? "Local Play Test is running. Map editing is locked." : "Local Play Test is stopped";
}

async function startEditorPlayTest(): Promise<void> {
  if (mapImportPending) return;
  const editor = await ensureMapEditorView();
  if (editor.startPlayTest()) updateEditorTestControls(true);
}

async function stopEditorPlayTest(): Promise<void> {
  if (mapEditorViewPromise) (await mapEditorViewPromise).stopPlayTest();
  updateEditorTestControls(false);
}

async function exportEditorMap(): Promise<void> {
  const editor = await ensureMapEditorView();
  const map = editor.getMapData();
  const json = JSON.stringify(map);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `guild-to-glory-map-${map.width}x${map.height}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  editorStatus.textContent = `Exported ${map.width} x ${map.height} JSON map`;
}

function refreshMapDetails(map: MapData): void {
  resetEditorToolSelection();
  renderAssetPalette(map.assets ?? []);
  mapWidthInput.value = String(map.width);
  mapHeightInput.value = String(map.height);
  mapSizeLabel.textContent = map.width + " x " + map.height;
  editorTilePosition.textContent = "None";
  editorTileType.textContent = "None";
  editorTileWalkable.textContent = "None";
}

async function changeEditorDimensions(resize: boolean): Promise<void> {
  if (editorPlayTestActive || mapImportPending) return;
  try {
    const width = Number(mapWidthInput.value);
    const height = Number(mapHeightInput.value);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 500 || height > 500) {
      throw new Error("Width and Height must be whole numbers from 1 to 500");
    }
    const editor = await ensureMapEditorView();
    const current = editor.getMapData();
    if (resize && width === current.width && height === current.height) return;
    const warning = resize
      ? "Resize to " + width + " x " + height + "? Tiles outside the new bounds will be permanently discarded."
      : "Create a new map? This replaces both layers and clears imported PNG assets. Export JSON first to keep a copy.";
    if ((!resize || width < current.width || height < current.height) && !window.confirm(warning)) return;
    const map = resize ? resizeMapData(current, width, height) : createMapData(width, height, newMapPreset.value as NewMapPreset);
    editor.setMapData(map);
    refreshMapDetails(map);
    editorStatus.textContent = (resize ? "Resized to " : "Created ") + width + " x " + height +
      (resize ? ". New cells are Empty / Blocked; out-of-bounds cells were discarded." : ". " + newMapPreset.selectedOptions[0]!.textContent);
  } catch (error) {
    editorStatus.textContent = error instanceof Error ? error.message : "Unable to change map size";
  }
}

async function importEditorMap(file: File): Promise<void> {
  if (editorPlayTestActive || mapImportPending) return;
  // Enough for 250,000 tiles including maximum-length optional texture keys.
  if (file.size > 400_000_000) {
    editorStatus.textContent = "Import failed: JSON file exceeds 400 MB";
    return;
  }
  mapImportPending = true;
  updateEditorTestControls(false);
  try {
    const { map: parsed, warnings } = parseMapImport(JSON.parse(await file.text()));
    const notice = [...warnings, "Import replaces both layers of the current map. Export first to keep your edits. Continue?"].join("\n\n");
    if (!window.confirm(notice)) {
      editorStatus.textContent = "Import cancelled. Current map preserved.";
      return;
    }
    const editor = await ensureMapEditorView();
    const textures = await prepareTileTextures(parsed.assets ?? []);
    editor.setMapData(parsed, textures);
    refreshMapDetails(parsed);
    editorStatus.textContent = "Imported " + parsed.width + " x " + parsed.height + " JSON map";
  } catch (error) {
    editorStatus.textContent = "Import failed: " + (error instanceof Error ? error.message : "Invalid JSON map");
  } finally {
    mapImportPending = false;
    updateEditorTestControls(false);
  }
}

function resetEditorToolSelection(): void {
  clearAssetSelection();
  editorToolButtons.forEach(button => {
    const selected = button.dataset.editorTool === "select";
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function clearAssetSelection(): void {
  assetPalette.querySelectorAll("button").forEach(button => {
    button.classList.remove("is-selected"); button.setAttribute("aria-pressed", "false");
  });
}

function renderAssetPalette(assets: TileImageAsset[]): void {
  editorAssets = assets;
  assetPalette.replaceChildren();
  if (!assets.length) {
    assetPalette.textContent = "No imported images";
    return;
  }
  for (const asset of assets) {
    const button = document.createElement("button");
    button.type = "button"; button.className = "asset-tile";
    button.title = asset.name; button.setAttribute("aria-label", "Paint " + asset.name);
    button.setAttribute("aria-pressed", "false");
    const preview = document.createElement("img"); preview.src = asset.dataUrl; preview.alt = "";
    const label = document.createElement("span"); label.textContent = asset.name;
    button.append(preview, label);
    button.addEventListener("click", async () => {
      if (editorPlayTestActive || mapImportPending || editorMode !== "texture") return;
      (await ensureMapEditorView()).setTool("paint", asset.id);
      clearAssetSelection();
      editorToolButtons.forEach(tool => { tool.classList.remove("is-selected"); tool.setAttribute("aria-pressed", "false"); });
      button.classList.add("is-selected"); button.setAttribute("aria-pressed", "true");
      editorStatus.textContent = "Paint " + asset.name;
    });
    const remove = document.createElement("button");
    remove.type = "button"; remove.className = "asset-delete";
    remove.textContent = "Delete"; remove.setAttribute("aria-label", "Delete " + asset.name);
    remove.addEventListener("click", async () => {
      if (editorPlayTestActive || mapImportPending) return;
      const editor = await ensureMapEditorView();
      if (editorPlayTestActive || mapImportPending) return;
      const count = editor.getMapData().tiles.filter(tile => tile.textureId === asset.id).length;
      if (!window.confirm('Delete "' + asset.name + '"? ' + count +
          " tile(s) will become Empty. Walkable / Blocked stays unchanged. Export first for a backup.")) return;
      const cleared = editor.removeImageAsset(asset.id);
      renderAssetPalette(editorAssets.filter(candidate => candidate.id !== asset.id));
      resetEditorToolSelection();
      editorTilePosition.textContent = "None";
      editorTileType.textContent = "None";
      editorTileWalkable.textContent = "None";
      editorStatus.textContent = "Deleted " + asset.name + "; cleared " + cleared + " tile texture(s).";
    });
    const entry = document.createElement("div"); entry.className = "asset-entry";
    entry.append(button, remove);
    assetPalette.append(entry);
  }
}

async function importEditorPngs(files: File[]): Promise<void> {
  if (editorPlayTestActive || mapImportPending || !files.length) return;
  if (editorAssets.length + files.length > MAX_TILE_IMAGES) {
    editorStatus.textContent = "Import failed: maximum 64 PNG assets per map";
    return;
  }
  mapImportPending = true;
  updateEditorTestControls(false);
  try {
    const assets: TileImageAsset[] = [];
    for (const file of files) assets.push(await importPngFile(file));
    const editor = await ensureMapEditorView();
    const textures = await prepareTileTextures(assets);
    editor.addImageAssets(assets, textures);
    editor.setTool("select");
    resetEditorToolSelection();
    renderAssetPalette([...editorAssets, ...assets]);
    editorStatus.textContent = "Imported " + assets.length + " PNG image(s). Select an image to paint.";
  } catch (error) {
    editorStatus.textContent = "PNG import failed: " + (error instanceof Error ? error.message : "Invalid PNG");
  } finally {
    mapImportPending = false;
    updateEditorTestControls(false);
  }
}

async function leaveWorld(): Promise<void> {
  stopPartySync();
  connectionAttempt += 1;
  const room = activeRoom;
  activeRoom = undefined;
  let leaveError: unknown;
  try {
    if (room) await room.leave();
  } catch (error) {
    leaveError = error;
  }
  if (worldViewPromise) resetWorld(await worldViewPromise);
  setStatus(leaveError ? "error" : "disconnected", leaveError instanceof Error ? leaveError.message : "Connection closed");
  roundTripTime.textContent = leaveError ? "LINK FAILED" : "NETWORK STANDBY";
}

async function showSection(section: SectionName): Promise<void> {
  if (currentSection === "world" && section !== "world") await leaveWorld();
  if (currentSection === "editor" && section !== "editor" && editorPlayTestActive) await stopEditorPlayTest();
  currentSection = section;
  if (section === "guild") refreshGuild();

  for (const [name, element] of Object.entries(sections) as [SectionName, HTMLElement][]) {
    element.hidden = name !== section;
  }
  navigationButtons.forEach((button) => {
    if (button.dataset.section === section) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  worldRoot.setAttribute("aria-hidden", String(section !== "world"));

  if (section === "world") {
    try {
      await ensureWorldView();
      if (currentSection === "world" && (status === "disconnected" || status === "error")) await connectToServer();
    } catch (error) {
      setStatus("error", error instanceof Error ? error.message : "Unable to initialize the world");
    }
  } else if (section === "editor") {
    try {
      await ensureMapEditorView();
    } catch (error) {
      editorStatus.textContent = error instanceof Error ? error.message : "Unable to initialize the Map Editor";
    }
  }
}

async function connectToServer(): Promise<void> {
  if (status === "connecting") return;

  if (status === "connected") {
    await leaveWorld();
    return;
  }

  const attempt = ++connectionAttempt;
  setStatus("connecting", "Opening a session with the game server");
  roundTripTime.textContent = "ESTABLISHING LINK";

  try {
    const profileId = await loadLocalProfile();
    const credential = await guestAccount.ensure();
    if(attempt!==connectionAttempt || currentSection!=="world")return;
    client.auth.token=credential;
    const room = await client.joinOrCreate(ROOM_NAME);
    if (attempt !== connectionAttempt || currentSection !== "world") {
      await room.leave();
      return;
    }
    const worldView = await ensureWorldView();
    if (attempt !== connectionAttempt || currentSection !== "world") {
      await room.leave();
      return;
    }
    activeRoom = room;
    stopPartySync();
    partySync=createPartySync(room,{load:async()=>{const result=await guildApi.load();return result.guild?{status:"ready" as const,guild:result.guild}:{status:"empty" as const};}},profileId,message=>{partySyncStatus.textContent=message;});
    worldInfo.hidden = false;
    let mapReady = false;
    let receivingMap = false;
    let latestState: WorldStateMessage = {players:[]};
    const failMap = async (error: unknown) => {
      if (activeRoom !== room) return;
      stopPartySync();
      activeRoom = undefined;
      clearTimeout(mapTimeout);
      resetWorld(worldView);
      setStatus("error", "World map load failed: " + (error instanceof Error ? error.message : String(error)));
      await room.leave().catch(() => {});
    };
    const mapTimeout = window.setTimeout(() => { void failMap(new Error("Server map response timed out")); },15000);
    room.onMessage<WorldMapMessage>(NETWORK_MESSAGES.worldMap, async message => {
      if (activeRoom !== room || receivingMap) return;
      receivingMap = true;
      try {
        if (!isWorldMapMessage(message)) throw new Error("Invalid authoritative map payload");
        const textures = await prepareTileTextures(message.map.assets ?? []);
        if (activeRoom !== room) {
          for (const texture of textures.values()) texture.destroy(true);
          return;
        }
        worldView.setMapData(message.map,textures);
        mapReady = true;
        clearTimeout(mapTimeout);
        document.querySelector("#world-title")!.textContent = message.mapId + " - " + message.mapName;
        worldView.setWorldState(latestState,room.sessionId);
        setStatus("connected", "Map " + message.mapId + " / Room " + room.roomId);
      } catch (error) { await failMap(error); }
    });
    room.onMessage<WorldStateMessage>(NETWORK_MESSAGES.worldState, message => {
      if (activeRoom !== room || !isWorldStateMessage(message)) return;
      latestState = message;
      if (mapReady) worldView.setWorldState(message,room.sessionId);
      playerCount.textContent = message.players.length + " players";
    });

    room.onMessage<{playerId:string}>("guest:identity",message=>{
      if(activeRoom===room)document.querySelector<HTMLElement>("#guest-player-id")!.textContent="Guest Player: "+message.playerId;
    });
    room.onMessage<PartyStateMessage>(NETWORK_MESSAGES.partyState, message => {
      if(activeRoom!==room)return;
      partySummary.replaceChildren(...message.parties.map(party=>{
        const item=document.createElement("li");
        const members=party.members.map(member=>member.name+" ("+member.rarity+", Lv "+member.level+")"+(member.id===party.leaderId?" [Leader]":"")).join(", ");
        item.textContent=(party.sessionId===room.sessionId?"You":party.sessionId)+" | "+(party.guildName??"No Guild")+" | "+party.memberIds.length+"/4 | "+(party.ready?"Ready":"Not Ready")+(members?": "+members:"");
        return item;
      }));
    });
    room.onMessage<PartyResultMessage>(NETWORK_MESSAGES.partyResult, message=>{
      if(activeRoom===room) partySyncStatus.textContent=(message.ok?"":"Party sync rejected: ")+message.message;
    });
    room.onMessage<PongMessage>(NETWORK_MESSAGES.pong, (message) => {
      if (activeRoom !== room) return;
      const latency = Math.max(0, Date.now() - message.sentAt);
      detailLabel.textContent = `Room ${room.roomId} · server responded`;
      roundTripTime.textContent = `LINK ${latency} MS`;
    });

    room.onLeave((code) => {
      if (activeRoom === room) stopPartySync();
      clearTimeout(mapTimeout);
      if (activeRoom !== room) return;
      activeRoom = undefined;
      resetWorld(worldView);
      setStatus("disconnected", `Connection closed (${code})`);
      roundTripTime.textContent = "NETWORK STANDBY";
    });

    room.onError((_code, message) => {
      if (activeRoom !== room) return;
      setStatus("error", message || "The room reported a connection error");
    });

    partySync.sync();
    room.send(NETWORK_MESSAGES.worldSync);
    const ping: PingMessage = { sentAt: Date.now() };
    room.send(NETWORK_MESSAGES.ping, ping);
  } catch (error) {
    if (attempt !== connectionAttempt) return;
    stopPartySync();
    activeRoom = undefined;
    worldInfo.hidden = true;
    setStatus("error", error instanceof Error ? error.message : "Unable to connect to the game server");
    roundTripTime.textContent = "LINK FAILED";
  }
}

connectButton.addEventListener("click", () => void connectToServer());
navigationButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const section = button.dataset.section as SectionName | undefined;
    if (section && section in sections) void showSection(section);
  });
});
gridGuideToggle.addEventListener("change", () => {
  void ensureMapEditorView().then(editor => editor.setGridGuideVisible(gridGuideToggle.checked));
});
editorModeButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (editorPlayTestActive || mapImportPending) return;
    clearAssetSelection();
    editorMode = button.dataset.editorMode as EditorMode;
    (await ensureMapEditorView()).setMode(editorMode);
    textureTools.hidden = editorMode !== "texture";
    gridTools.hidden = editorMode !== "grid";
    editorModeButtons.forEach(candidate => {
      const selected = candidate === button;
      candidate.classList.toggle("is-selected", selected);
      candidate.setAttribute("aria-pressed", String(selected));
    });
    editorToolButtons.forEach(candidate => {
      const selected = candidate.dataset.editorTool === "select";
      candidate.classList.toggle("is-selected", selected);
      candidate.setAttribute("aria-pressed", String(selected));
    });
    updateEditorTestControls(false);
    editorStatus.textContent = editorMode === "texture" ? "Texture Mode selected" : "Grid Mode selected";
  });
});
editorToolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (editorPlayTestActive || mapImportPending) return;
    clearAssetSelection();
    const tool = button.dataset.editorTool as EditorTool | undefined;
    const tileType = button.dataset.tileType as MapTextureId | undefined;
    if (!tool) return;
    mapEditorViewPromise?.then((editor) => editor.setTool(tool, tileType));
    editorToolButtons.forEach((candidate) => {
      const selected = candidate === button;
      candidate.classList.toggle("is-selected", selected);
      candidate.setAttribute("aria-pressed", String(selected));
    });
    editorStatus.textContent = tool === "paint" ? `Paint ${tileType ?? "grass"}` : `${tool[0]!.toUpperCase()}${tool.slice(1)} tool selected`;
  });
});
importPngButton.addEventListener("click", () => importPngInput.click());
importPngInput.addEventListener("change", () => {
  const files = Array.from(importPngInput.files ?? []);
  importPngInput.value = "";
  void importEditorPngs(files);
});
newMapButton.addEventListener("click", () => void changeEditorDimensions(false));
resizeMapButton.addEventListener("click", () => void changeEditorDimensions(true));
document.querySelector("#zoom-in")!.addEventListener("click", () => { void mapEditorViewPromise?.then(editor => editor.zoom(1.25)); });
document.querySelector("#zoom-out")!.addEventListener("click", () => { void mapEditorViewPromise?.then(editor => editor.zoom(0.8)); });
document.querySelector("#reset-camera")!.addEventListener("click", () => { void mapEditorViewPromise?.then(editor => editor.resetCamera()); });
importMapButton.addEventListener("click", () => importMapInput.click());
importMapInput.addEventListener("change", () => {
  const file = importMapInput.files?.[0];
  if (file) void importEditorMap(file);
  importMapInput.value = "";
});
exportMapButton.addEventListener("click", () => void exportEditorMap());
playTestButton.addEventListener("click", () => void startEditorPlayTest());
stopTestButton.addEventListener("click", () => void stopEditorPlayTest());

async function createWorldView(): Promise<WorldView> {
  const app = new Application();
  await app.init({
    background: "#172c24",
    antialias: true,
    resizeTo: worldRoot,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true
  });
  app.canvas.style.touchAction = "none";
  app.canvas.style.cursor = "crosshair";
  worldRoot.appendChild(app.canvas);
  return new WorldView(app, (destination) => {
    activeRoom?.send(NETWORK_MESSAGES.destination, destination);
  });
}

void showSection("menu");