import { Client, type Room } from "colyseus.js";
import { Application, Container, Graphics, Rectangle, Text } from "pixi.js";
import {
  ADVENTURER_STAT_KEYS,
  GRID_OBSTACLES,
  GRID_SIZE,
  ISO_TILE_HEIGHT,
  ISO_TILE_WIDTH,
  NETWORK_MESSAGES,
  RARITY_CONFIG,
  ROOM_NAME,
  generateAdventurer,
  isWorldStateMessage,
  type AdventurerStat,
  type GeneratedAdventurer,
  type GridPoint,
  type PingMessage,
  type PongMessage,
  type TraitDefinition,
  type WorldPlayer,
  type WorldStateMessage
} from "@guild-to-glory/shared";
import "./style.css";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
type SectionName = "menu" | "world" | "adventurers";

const serverUrl = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";
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
  menu: document.querySelector<HTMLElement>("#menu-section")!,
  world: document.querySelector<HTMLElement>("#world-section")!,
  adventurers: document.querySelector<HTMLElement>("#adventurers-section")!
};
const navigationButtons = document.querySelectorAll<HTMLButtonElement>("[data-section]");
const worldInfo = document.querySelector<HTMLDivElement>("#world-info")!;
const playerCount = document.querySelector<HTMLSpanElement>("#player-count")!;
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

const MAP_WIDTH = GRID_SIZE * ISO_TILE_WIDTH;
const MAP_HEIGHT = GRID_SIZE * ISO_TILE_HEIGHT + 32;
const MAP_ORIGIN_Y = 24;
const BLOCK_DEPTH = 12;
const BLOCKED_TILES = new Set(GRID_OBSTACLES.map(({ column, row }) => `${column},${row}`));

function projectGridPoint(point: Pick<GridPoint, "column" | "row">): { x: number; y: number } {
  return {
    x: MAP_WIDTH / 2 + (point.column - point.row) * ISO_TILE_WIDTH / 2,
    y: MAP_ORIGIN_Y + (point.column + point.row) * ISO_TILE_HEIGHT / 2
  };
}

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
  private readonly scene = new Container();
  private readonly players = new Map<string, PlayerVisual>();
  private readonly mapLayer = new Graphics();
  private readonly selection = new Graphics();

  constructor(app: Application, private readonly onDestination: (destination: GridPoint) => void) {
    this.app = app;
    this.drawMap();
    this.mapLayer.zIndex = -2;
    this.selection.zIndex = -1;
    this.scene.addChild(this.mapLayer, this.selection);
    this.scene.sortableChildren = true;
    this.scene.eventMode = "static";
    this.scene.hitArea = new Rectangle(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.scene.on("pointerdown", (event) => this.selectTile(event.global.x, event.global.y));
    app.stage.addChild(this.scene);
    this.layout();
    app.renderer.on("resize", () => this.layout());
    app.ticker.add(() => this.interpolatePlayers());
  }

  setWorldState(state: WorldStateMessage, localPlayerId?: string): void {
    const seenPlayers = new Set<string>();

    for (const player of state.players) {
      seenPlayers.add(player.id);
      let visual = this.players.get(player.id);
      if (!visual) {
        visual = this.createPlayer(player);
        this.players.set(player.id, visual);
        this.scene.addChild(visual.container);
      }

      const position = projectGridPoint({ column: player.x, row: player.y });
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
    for (let depth = 0; depth < GRID_SIZE * 2 - 1; depth += 1) {
      const firstColumn = Math.max(0, depth - GRID_SIZE + 1);
      const lastColumn = Math.min(GRID_SIZE - 1, depth);
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        this.drawTile(column, depth - column);
      }
    }
  }

  private drawTile(column: number, row: number): void {
    const { x, y } = projectGridPoint({ column, row });
    const blocked = BLOCKED_TILES.has(`${column},${row}`);
    const top = { x, y: y - ISO_TILE_HEIGHT / 2 };
    const right = { x: x + ISO_TILE_WIDTH / 2, y };
    const bottom = { x, y: y + ISO_TILE_HEIGHT / 2 };
    const left = { x: x - ISO_TILE_WIDTH / 2, y };

    this.mapLayer.moveTo(left.x, left.y)
      .lineTo(bottom.x, bottom.y)
      .lineTo(bottom.x, bottom.y + BLOCK_DEPTH)
      .lineTo(left.x, left.y + BLOCK_DEPTH)
      .closePath()
      .fill({ color: blocked ? "#554a3d" : "#294b3b" })
      .stroke({ color: "#172d25", alpha: 0.8, width: 1 });
    this.mapLayer.moveTo(right.x, right.y)
      .lineTo(bottom.x, bottom.y)
      .lineTo(bottom.x, bottom.y + BLOCK_DEPTH)
      .lineTo(right.x, right.y + BLOCK_DEPTH)
      .closePath()
      .fill({ color: blocked ? "#6a5945" : "#315743" })
      .stroke({ color: "#172d25", alpha: 0.8, width: 1 });
    const tileColor = blocked ? 0x8a7255 : (column + row) % 2 === 0 ? 0x47795d : 0x3e7054;
    drawDiamond(this.mapLayer, x, y, tileColor);
    if (column === 0 || row === 0 || column === GRID_SIZE - 1 || row === GRID_SIZE - 1) {
      this.mapLayer.moveTo(top.x, top.y)
        .lineTo(right.x, right.y)
        .lineTo(bottom.x, bottom.y)
        .lineTo(left.x, left.y)
        .closePath()
        .stroke({ color: "#d9bb76", alpha: 0.6, width: 1.5 });
    }
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
    name.anchor.set(0.5, 0);
    name.position.set(0, 8);
    container.addChild(character, name);
    const position = projectGridPoint({ column: player.x, row: player.y });
    container.position.set(position.x, position.y);
    return { container, targetX: position.x, targetY: position.y };
  }

  private selectTile(screenX: number, screenY: number): void {
    const local = this.scene.toLocal({ x: screenX, y: screenY });
    const deltaX = local.x - MAP_WIDTH / 2;
    const deltaY = local.y - MAP_ORIGIN_Y;
    const destination = {
      column: Math.round(deltaX / ISO_TILE_WIDTH + deltaY / ISO_TILE_HEIGHT),
      row: Math.round(deltaY / ISO_TILE_HEIGHT - deltaX / ISO_TILE_WIDTH)
    };
    if (destination.column < 0 || destination.column >= GRID_SIZE || destination.row < 0 || destination.row >= GRID_SIZE) return;
    if (BLOCKED_TILES.has(`${destination.column},${destination.row}`)) return;

    this.selection.clear();
    const { x, y } = projectGridPoint(destination);
    drawDiamond(this.selection, x, y, 0xf0cc73, 0.42);
    this.onDestination(destination);
  }

  private layout(): void {
    const scale = Math.min(this.app.screen.width / MAP_WIDTH, this.app.screen.height / MAP_HEIGHT);
    this.scene.scale.set(scale);
    this.scene.position.set(
      (this.app.screen.width - MAP_WIDTH * scale) / 2,
      (this.app.screen.height - MAP_HEIGHT * scale) / 2
    );
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
  view.setWorldState({ players: [] });
  playerCount.textContent = "0 players";
  worldInfo.hidden = true;
}

async function ensureWorldView(): Promise<WorldView> {
  if (!worldViewPromise) worldViewPromise = createWorldView();
  return worldViewPromise;
}

async function leaveWorld(): Promise<void> {
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
  currentSection = section;

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
    } catch (error) {
      setStatus("error", error instanceof Error ? error.message : "Unable to initialize the world");
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
    worldInfo.hidden = false;
    setStatus("connected", `Room ${room.roomId} · checking server response`);

    room.onMessage<WorldStateMessage>(NETWORK_MESSAGES.worldState, (message) => {
      if (activeRoom !== room || !isWorldStateMessage(message)) return;
      worldView.setWorldState(message, room.sessionId);
      playerCount.textContent = `${message.players.length} ${message.players.length === 1 ? "player" : "players"}`;
    });

    room.onMessage<PongMessage>(NETWORK_MESSAGES.pong, (message) => {
      if (activeRoom !== room) return;
      const latency = Math.max(0, Date.now() - message.sentAt);
      detailLabel.textContent = `Room ${room.roomId} · server responded`;
      roundTripTime.textContent = `LINK ${latency} MS`;
    });

    room.onLeave((code) => {
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

    room.send(NETWORK_MESSAGES.worldSync);
    const ping: PingMessage = { sentAt: Date.now() };
    room.send(NETWORK_MESSAGES.ping, ping);
  } catch (error) {
    if (attempt !== connectionAttempt) return;
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