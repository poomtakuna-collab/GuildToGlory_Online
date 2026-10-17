import { isMapData, type MapData, type GridPoint } from "./grid.js";

export const ROOM_NAME = "connection";

export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 800;
export const PLAYER_RADIUS = 16;

export const NETWORK_MESSAGES = {
  partySnapshot: "party:snapshot",
  partyState: "party:state",
  partyResult: "party:result",
  ping: "ping",
  pong: "pong",
  destination: "world:destination",
  worldSync: "world:sync",
  worldMap: "world:map",
  worldState: "world:state"
} as const;

export interface PingMessage {
  sentAt: number;
}

export interface PongMessage {
  sentAt: number;
  serverTime: number;
}

export interface WorldDestinationMessage extends GridPoint {}

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

export function isWorldDestinationMessage(value: unknown): value is WorldDestinationMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "column" in value && typeof value.column === "number" && Number.isInteger(value.column) &&
    "row" in value && typeof value.row === "number" && Number.isInteger(value.row)
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
export interface WorldMapMessage { mapId: string; mapName: string; map: MapData }
export function isWorldMapMessage(value: unknown): value is WorldMapMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as WorldMapMessage;
  return typeof message.mapId === "string" && message.mapId.length > 0 &&
    typeof message.mapName === "string" && isMapData(message.map);
}
