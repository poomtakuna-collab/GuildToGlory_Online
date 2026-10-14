import { Room, type Client } from "@colyseus/core";
import {
  NETWORK_MESSAGES,
  PLAYER_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  isMovementInputMessage,
  isPingMessage,
  type MovementInputMessage,
  type PongMessage,
  type WorldPlayer,
  type WorldStateMessage
} from "@guild-to-glory/shared";

interface PlayerState extends WorldPlayer {
  input: MovementInputMessage;
}

const PLAYER_SPEED = 220;
const TICK_RATE = 20;
const PLAYER_COLORS = [0xe5bd69, 0x70b8a0, 0xd97d69, 0x8c9ddd, 0xd783b4, 0xa7bd67];

const STOPPED: MovementInputMessage = { up: false, down: false, left: false, right: false };

export class ConnectionRoom extends Room {
  private readonly players = new Map<string, PlayerState>();
  private nextPlayerNumber = 0;

  onCreate(): void {
    this.onMessage(NETWORK_MESSAGES.ping, (client: Client, payload: unknown) => {
      if (!isPingMessage(payload)) return;

      const response: PongMessage = {
        sentAt: payload.sentAt,
        serverTime: Date.now()
      };
      client.send(NETWORK_MESSAGES.pong, response);
    });

    this.onMessage(NETWORK_MESSAGES.movement, (client: Client, payload: unknown) => {
      if (!isMovementInputMessage(payload)) return;
      const player = this.players.get(client.sessionId);
      if (player) player.input = payload;
    });

    this.onMessage(NETWORK_MESSAGES.worldSync, (client: Client) => {
      client.send(NETWORK_MESSAGES.worldState, this.createWorldState());
    });

    this.setSimulationInterval((deltaTime) => this.updatePlayers(deltaTime), 1000 / TICK_RATE);
  }

  onJoin(client: Client): void {
    const playerNumber = ++this.nextPlayerNumber;
    this.players.set(client.sessionId, {
      id: client.sessionId,
      name: `Adventurer ${playerNumber}`,
      color: PLAYER_COLORS[(playerNumber - 1) % PLAYER_COLORS.length]!,
      x: WORLD_WIDTH / 2 + ((playerNumber - 1) % 4) * 128 - 72,
      y: WORLD_HEIGHT / 2 + Math.floor((playerNumber - 1) / 4) * 48,
      input: { ...STOPPED }
    });
    this.broadcastWorldState();
  }

  onLeave(client: Client): void {
    this.players.delete(client.sessionId);
    this.broadcastWorldState();
  }

  private updatePlayers(deltaTime: number): void {
    const seconds = Math.min(deltaTime, 100) / 1000;

    for (const player of this.players.values()) {
      const horizontal = Number(player.input.right) - Number(player.input.left);
      const vertical = Number(player.input.down) - Number(player.input.up);
      const magnitude = Math.hypot(horizontal, vertical);
      if (magnitude === 0) continue;

      const distance = PLAYER_SPEED * seconds / magnitude;
      player.x = Math.max(PLAYER_RADIUS, Math.min(WORLD_WIDTH - PLAYER_RADIUS, player.x + horizontal * distance));
      player.y = Math.max(PLAYER_RADIUS, Math.min(WORLD_HEIGHT - PLAYER_RADIUS, player.y + vertical * distance));
    }

    this.broadcastWorldState();
  }

  private createWorldState(): WorldStateMessage {
    return {
      players: Array.from(this.players.values(), ({ input: _input, ...player }) => ({ ...player }))
    };
  }

  private broadcastWorldState(): void {
    this.broadcast(NETWORK_MESSAGES.worldState, this.createWorldState());
  }
}