export const ROOM_NAME = "connection";

export const NETWORK_MESSAGES = {
  ping: "ping",
  pong: "pong"
} as const;

export interface PingMessage {
  sentAt: number;
}

export interface PongMessage {
  sentAt: number;
  serverTime: number;
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