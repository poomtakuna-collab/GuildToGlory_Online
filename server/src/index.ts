import { getWorldMaps } from "./worldMaps.js";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@guild-to-glory/shared";
import { ConnectionRoom } from "./rooms/ConnectionRoom.js";

try {
  getWorldMaps();
} catch (error) {
  console.error("World startup validation failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}

const port = Number(process.env.PORT ?? 2567);
const gameServer = new Server({ transport: new WebSocketTransport() });

gameServer.define(ROOM_NAME, ConnectionRoom);
await gameServer.listen(port);
console.log(`GuildToGlory game server listening on port ${port}`);