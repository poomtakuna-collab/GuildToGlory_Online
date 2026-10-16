import { Room, type Client } from "@colyseus/core";
import {
  findGridPath,
  GRID_OBSTACLES,
  GRID_SIZE,
  NETWORK_MESSAGES,
  isPingMessage,
  isWorldDestinationMessage,
  type GridPoint,
  type PongMessage,
  type WorldPlayer,
  type WorldStateMessage
} from "@guild-to-glory/shared";

interface PlayerState extends WorldPlayer {
  path: GridPoint[];
  pathIndex: number;
}

const PLAYER_SPEED = 4.5;
const TICK_RATE = 20;
const PLAYER_COLORS = [0xe5bd69, 0x70b8a0, 0xd97d69, 0x8c9ddd, 0xd783b4, 0xa7bd67];
const SPAWN_POINTS = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => ({
  column: index % GRID_SIZE,
  row: Math.floor(index / GRID_SIZE)
})).filter((point) => !GRID_OBSTACLES.some((obstacle) => obstacle.column === point.column && obstacle.row === point.row));

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

    this.onMessage(NETWORK_MESSAGES.destination, (client: Client, payload: unknown) => {
      if (!isWorldDestinationMessage(payload)) return;
      const player = this.players.get(client.sessionId);
      if (!player) return;

      const start = { column: Math.round(player.x), row: Math.round(player.y) };
      const path = findGridPath(start, payload);
      if (!path) return;
      player.path = path;
      player.pathIndex = 0;
    });

    this.onMessage(NETWORK_MESSAGES.worldSync, (client: Client) => {
      client.send(NETWORK_MESSAGES.worldState, this.createWorldState());
    });

    this.setSimulationInterval((deltaTime) => this.updatePlayers(deltaTime), 1000 / TICK_RATE);
  }

  onJoin(client: Client): void {
    const playerNumber = ++this.nextPlayerNumber;
    const spawn = SPAWN_POINTS[(playerNumber - 1) % SPAWN_POINTS.length]!;
    this.players.set(client.sessionId, {
      id: client.sessionId,
      name: `Adventurer ${playerNumber}`,
      color: PLAYER_COLORS[(playerNumber - 1) % PLAYER_COLORS.length]!,
      x: spawn.column,
      y: spawn.row,
      path: [],
      pathIndex: 0
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
      let remainingDistance = PLAYER_SPEED * seconds;
      while (remainingDistance > 0 && player.pathIndex < player.path.length) {
        const target = player.path[player.pathIndex]!;
        const deltaColumn = target.column - player.x;
        const deltaRow = target.row - player.y;
        const distance = Math.hypot(deltaColumn, deltaRow);
        if (distance < 0.0001) {
          player.x = target.column;
          player.y = target.row;
          player.pathIndex += 1;
          continue;
        }

        const travel = Math.min(remainingDistance, distance);
        player.x += deltaColumn / distance * travel;
        player.y += deltaRow / distance * travel;
        remainingDistance -= travel;
        if (travel === distance) player.pathIndex += 1;
      }

      if (player.pathIndex >= player.path.length) {
        player.path = [];
        player.pathIndex = 0;
      }
    }

    this.broadcastWorldState();
  }

  private createWorldState(): WorldStateMessage {
    return {
      players: Array.from(this.players.values(), ({ path: _path, pathIndex: _pathIndex, ...player }) => ({ ...player }))
    };
  }

  private broadcastWorldState(): void {
    this.broadcast(NETWORK_MESSAGES.worldState, this.createWorldState());
  }
}