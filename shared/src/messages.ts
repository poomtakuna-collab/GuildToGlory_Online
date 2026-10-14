export const ROOM_NAME = "connection";

export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 800;
export const PLAYER_RADIUS = 16;

export const NETWORK_MESSAGES = {
  ping: "ping",
  pong: "pong",
  movement: "movement",
  worldSync: "world:sync",
  worldState: "world:state"
} as const;

export interface PingMessage {
  sentAt: number;
}

export interface PongMessage {
  sentAt: number;
  serverTime: number;
}

export interface MovementInputMessage {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface WorldPlayer {
  id: string;
  name: string;
  color: number;
  x: number;
  y: number;
}

export interface WorldStateMessage {
  players: WorldPlayer[];
}

export function isPingMessage(value: unknown): value is PingMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "sentAt" in value &&
    typeof value.sentAt === "number" &&
    Number.isFinite(value.sentAt)
  );
}

export function isMovementInputMessage(value: unknown): value is MovementInputMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "up" in value && typeof value.up === "boolean" &&
    "down" in value && typeof value.down === "boolean" &&
    "left" in value && typeof value.left === "boolean" &&
    "right" in value && typeof value.right === "boolean"
  );
}

export function isWorldStateMessage(value: unknown): value is WorldStateMessage {
  if (typeof value !== "object" || value === null || !("players" in value) || !Array.isArray(value.players)) {
    return false;
  }

  return value.players.every((player) => (
    typeof player === "object" &&
    player !== null &&
    "id" in player && typeof player.id === "string" &&
    "name" in player && typeof player.name === "string" &&
    "color" in player && typeof player.color === "number" && Number.isInteger(player.color) &&
    "x" in player && typeof player.x === "number" && Number.isFinite(player.x) &&
    "y" in player && typeof player.y === "number" && Number.isFinite(player.y)
  ));
}