import { Client, type Room } from "colyseus.js";
import { Application, Container, Graphics, Text } from "pixi.js";
import {
  ADVENTURER_STAT_KEYS,
  NETWORK_MESSAGES,
  PLAYER_RADIUS,
  RARITY_CONFIG,
  ROOM_NAME,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  generateAdventurer,
  isWorldStateMessage,
  type AdventurerStat,
  type GeneratedAdventurer,
  type MovementInputMessage,
  type PingMessage,
  type PongMessage,
  type WorldPlayer,
  type WorldStateMessage
} from "@guild-to-glory/shared";
import "./style.css";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

const serverUrl = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";
const connectButton = document.querySelector<HTMLButtonElement>("#connect-button")!;
const connectLabel = document.querySelector<HTMLSpanElement>("#connect-label")!;
const statusLabel = document.querySelector<HTMLParagraphElement>("#connection-status")!;
const detailLabel = document.querySelector<HTMLParagraphElement>("#connection-detail")!;
const statusIndicator = document.querySelector<HTMLSpanElement>("#status-indicator")!;
const serverAddress = document.querySelector<HTMLSpanElement>("#server-address")!;
const roundTripTime = document.querySelector<HTMLSpanElement>("#round-trip-time")!;
const worldRoot = document.querySelector<HTMLDivElement>("#pixi-root")!;
const gameShell = document.querySelector<HTMLElement>(".game-shell")!;
const worldInfo = document.querySelector<HTMLDivElement>("#world-info")!;
const playerCount = document.querySelector<HTMLSpanElement>("#player-count")!;
const generateButton = document.querySelector<HTMLButtonElement>("#generate-button")!;
const adventurerName = document.querySelector<HTMLHeadingElement>("#adventurer-name")!;
const adventurerRarity = document.querySelector<HTMLSpanElement>("#adventurer-rarity")!;
const adventurerLevel = document.querySelector<HTMLElement>("#adventurer-level")!;
const startingSkillsList = document.querySelector<HTMLUListElement>("#starting-skills-list")!;
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
let currentInput: MovementInputMessage = { up: false, down: false, left: false, right: false };
const heldKeys = new Set<string>();
let status: ConnectionStatus = "disconnected";
const statusNames: Record<ConnectionStatus, string> = {
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error"
};

serverAddress.textContent = serverUrl;

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
}

generateButton.addEventListener("click", () => displayAdventurer(generateAdventurer()));
displayAdventurer(generateAdventurer());

interface PlayerVisual {
  container: Container;
  targetX: number;
  targetY: number;
}

class WorldView {
  private readonly app: Application;
  private readonly scene = new Container();
  private readonly players = new Map<string, PlayerVisual>();

  constructor(app: Application) {
    this.app = app;
    this.drawMap();
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

      visual.targetX = player.x;
      visual.targetY = player.y;
      visual.container.zIndex = Math.round(player.y);
      visual.container.label = player.id === localPlayerId ? "You" : player.name;
    }

    for (const [playerId, visual] of this.players) {
      if (seenPlayers.has(playerId)) continue;
      this.scene.removeChild(visual.container);
      visual.container.destroy({ children: true });
      this.players.delete(playerId);
    }

    this.scene.sortableChildren = true;
  }

  private drawMap(): void {
    const map = new Graphics();
    map.rect(14, 14, WORLD_WIDTH - 28, WORLD_HEIGHT - 28)
      .fill({ color: "#203d31" })
      .stroke({ color: "#d9bb76", alpha: 0.55, width: 3 });

    for (let x = 64; x < WORLD_WIDTH; x += 64) {
      map.moveTo(x, 16).lineTo(x, WORLD_HEIGHT - 16).stroke({ color: "#b7c58d", alpha: 0.055, width: 1 });
    }
    for (let y = 64; y < WORLD_HEIGHT; y += 64) {
      map.moveTo(16, y).lineTo(WORLD_WIDTH - 16, y).stroke({ color: "#b7c58d", alpha: 0.055, width: 1 });
    }

    map.roundRect(470, 270, 260, 210, 28)
      .fill({ color: "#536c45" })
      .stroke({ color: "#a9b37e", alpha: 0.48, width: 2 });
    map.roundRect(500, 305, 200, 140, 10)
      .fill({ color: "#6b5940" })
      .stroke({ color: "#d4b777", alpha: 0.8, width: 2 });
    map.rect(574, 365, 52, 80).fill({ color: "#362f28" });
    map.moveTo(460, 375).lineTo(190, 375).lineTo(190, 210).stroke({ color: "#b29d6b", alpha: 0.55, width: 26 });
    map.moveTo(740, 375).lineTo(1010, 375).lineTo(1010, 590).stroke({ color: "#b29d6b", alpha: 0.55, width: 26 });

    for (const [x, y] of [[150, 150], [1040, 160], [112, 650], [1090, 660], [850, 120], [350, 650]] as const) {
      map.circle(x, y, 26).fill({ color: "#294d3a" }).stroke({ color: "#71906a", alpha: 0.65, width: 2 });
      map.circle(x, y, 12).fill({ color: "#54734d" });
    }

    this.scene.addChild(map);
  }

  private createPlayer(player: WorldPlayer): PlayerVisual {
    const container = new Container();
    const character = new Graphics();
    character.circle(0, 0, PLAYER_RADIUS).fill({ color: player.color })
      .stroke({ color: "#f2eddc", alpha: 0.9, width: 2 });
    character.circle(0, -PLAYER_RADIUS - 2, 5).fill({ color: "#f2eddc" });
    const name = new Text({
      text: player.name,
      style: { fill: "#f2eddc", fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: "600" }
    });
    name.anchor.set(0.5, 0);
    name.position.set(0, PLAYER_RADIUS + 5);
    container.addChild(character, name);
    container.position.set(player.x, player.y);
    return { container, targetX: player.x, targetY: player.y };
  }

  private layout(): void {
    const scale = Math.min(this.app.screen.width / WORLD_WIDTH, this.app.screen.height / WORLD_HEIGHT);
    this.scene.scale.set(scale);
    this.scene.position.set(
      (this.app.screen.width - WORLD_WIDTH * scale) / 2,
      (this.app.screen.height - WORLD_HEIGHT * scale) / 2
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
  currentInput = { up: false, down: false, left: false, right: false };
  heldKeys.clear();
  playerCount.textContent = "0 players";
  worldInfo.hidden = true;
  gameShell.classList.remove("is-connected");
}

async function connectToServer(): Promise<void> {
  if (status === "connecting") return;

  if (status === "connected" && activeRoom) {
    const room = activeRoom;
    activeRoom = undefined;
    await room.leave();
    resetWorld(await worldViewPromise);
    setStatus("disconnected", "Connection closed");
    roundTripTime.textContent = "NETWORK STANDBY";
    return;
  }

  setStatus("connecting", "Opening a session with the game server");
  roundTripTime.textContent = "ESTABLISHING LINK";

  try {
    const room = await client.joinOrCreate(ROOM_NAME);
    const worldView = await worldViewPromise;
    activeRoom = room;
    currentInput = { up: false, down: false, left: false, right: false };
    heldKeys.clear();
    gameShell.classList.add("is-connected");
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
    activeRoom = undefined;
    gameShell.classList.remove("is-connected");
    worldInfo.hidden = true;
    setStatus("error", error instanceof Error ? error.message : "Unable to connect to the game server");
    roundTripTime.textContent = "LINK FAILED";
  }
}

function releaseMovement(): void {
  heldKeys.clear();
  sendMovementInput();
}

function sendMovementInput(): void {
  const nextInput: MovementInputMessage = {
    up: heldKeys.has("w") || heldKeys.has("arrowup"),
    down: heldKeys.has("s") || heldKeys.has("arrowdown"),
    left: heldKeys.has("a") || heldKeys.has("arrowleft"),
    right: heldKeys.has("d") || heldKeys.has("arrowright")
  };
  if (Object.keys(nextInput).every((key) => nextInput[key as keyof MovementInputMessage] === currentInput[key as keyof MovementInputMessage])) {
    return;
  }

  currentInput = nextInput;
  activeRoom?.send(NETWORK_MESSAGES.movement, nextInput);
}

window.addEventListener("keydown", (event) => {
  if (!activeRoom) return;
  const key = event.key.toLowerCase();
  if (!["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) return;
  event.preventDefault();
  heldKeys.add(key);
  sendMovementInput();
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (!heldKeys.delete(key)) return;
  sendMovementInput();
});

window.addEventListener("blur", releaseMovement);

connectButton.addEventListener("click", () => void connectToServer());

async function createWorldView(): Promise<WorldView> {
  const app = new Application();
  await app.init({
    background: "#172c24",
    antialias: true,
    resizeTo: worldRoot,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true
  });
  worldRoot.appendChild(app.canvas);
  return new WorldView(app);
}

const worldViewPromise = createWorldView();