import { Client, type Room } from "colyseus.js";
import { Application, Container, Graphics, Text } from "pixi.js";
import {
  NETWORK_MESSAGES,
  ROOM_NAME,
  type PingMessage,
  type PongMessage
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

const client = new Client(serverUrl);
let activeRoom: Room | undefined;
let status: ConnectionStatus = "disconnected";
const statusNames: Record<ConnectionStatus, string> = {
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error"
};

serverAddress.textContent = serverUrl;

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

async function connectToServer(): Promise<void> {
  if (status === "connecting") return;

  if (status === "connected" && activeRoom) {
    const room = activeRoom;
    activeRoom = undefined;
    await room.leave();
    setStatus("disconnected", "Connection closed");
    roundTripTime.textContent = "NETWORK STANDBY";
    return;
  }

  setStatus("connecting", "Opening a session with the game server");
  roundTripTime.textContent = "ESTABLISHING LINK";

  try {
    const room = await client.joinOrCreate(ROOM_NAME);
    activeRoom = room;
    setStatus("connected", `Room ${room.roomId} · checking server response`);

    room.onMessage<PongMessage>(NETWORK_MESSAGES.pong, (message) => {
      if (activeRoom !== room) return;
      const latency = Math.max(0, Date.now() - message.sentAt);
      detailLabel.textContent = `Room ${room.roomId} · server responded`;
      roundTripTime.textContent = `LINK ${latency} MS`;
    });

    room.onLeave((code) => {
      if (activeRoom !== room) return;
      activeRoom = undefined;
      setStatus("disconnected", `Connection closed (${code})`);
      roundTripTime.textContent = "NETWORK STANDBY";
    });

    room.onError((_code, message) => {
      if (activeRoom !== room) return;
      setStatus("error", message || "The room reported a connection error");
    });

    const ping: PingMessage = { sentAt: Date.now() };
    room.send(NETWORK_MESSAGES.ping, ping);
  } catch (error) {
    activeRoom = undefined;
    setStatus("error", error instanceof Error ? error.message : "Unable to connect to the game server");
    roundTripTime.textContent = "LINK FAILED";
  }
}

connectButton.addEventListener("click", () => void connectToServer());

async function createWorldBackdrop(): Promise<void> {
  const app = new Application();
  await app.init({
    background: "#101a18",
    antialias: true,
    resizeTo: worldRoot,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true
  });
  worldRoot.appendChild(app.canvas);

  const scene = new Container();
  const landscape = new Graphics();
  const title = new Text({
    text: "GUILD TO GLORY",
    style: {
      fill: "#e5c982",
      fontFamily: "Georgia, serif",
      fontSize: 18,
      letterSpacing: 5,
      fontWeight: "bold"
    }
  });
  title.anchor.set(0.5);
  title.alpha = 0.16;
  scene.addChild(landscape, title);
  app.stage.addChild(scene);

  const draw = (): void => {
    const width = app.screen.width;
    const height = app.screen.height;
    landscape.clear();
    landscape
      .moveTo(0, height * 0.77)
      .lineTo(width * 0.18, height * 0.72)
      .lineTo(width * 0.32, height * 0.79)
      .lineTo(width * 0.52, height * 0.68)
      .lineTo(width * 0.72, height * 0.76)
      .lineTo(width, height * 0.7)
      .lineTo(width, height)
      .lineTo(0, height)
      .closePath()
      .fill({ color: "#152723", alpha: 0.62 });
    landscape
      .circle(width * 0.78, height * 0.28, Math.min(width, height) * 0.14)
      .stroke({ color: "#d9bb76", alpha: 0.12, width: 1 });
    landscape
      .circle(width * 0.78, height * 0.28, Math.min(width, height) * 0.19)
      .stroke({ color: "#d9bb76", alpha: 0.07, width: 1 });
    title.position.set(width * 0.78, height * 0.28);
  };

  draw();
  app.renderer.on("resize", draw);
}

void createWorldBackdrop();