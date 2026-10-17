import { GuildRepository } from "./database/repository.js";
import { GuildService } from "./guild/service.js";
import { guildHttp } from "./guild/http.js";
import { createServer } from "node:http";
import { Guests } from "./auth/guests.js";
import { guestHttp } from "./auth/http.js";
import { authenticatedRoom } from "./auth/authenticatedRoom.js";
import { GuildDatabase, databasePath } from "./database/database.js";
import { getWorldMaps } from "./worldMaps.js";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@guild-to-glory/shared";


try {
  getWorldMaps();
} catch (error) {
  console.error("World startup validation failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}

let database: GuildDatabase;
try {
  database=new GuildDatabase(databasePath());
} catch(error) {
  console.error("Database initialization failed:",error instanceof Error ? error.message : error);
  process.exit(1);
}
process.once("exit",()=>database.close());
const port = Number(process.env.PORT ?? 2567);
const guests=new Guests(database);
const origins=(process.env.GUEST_ALLOWED_ORIGINS??"http://localhost:5173,http://127.0.0.1:5173").split(",").map(origin=>origin.trim());
const guestHandler=guestHttp(guests,origins);
const guildHandler=guildHttp(guests,new GuildService(new GuildRepository(database),process.env.NODE_ENV,process.env.ENABLE_LEGACY_IMPORT==="true"),origins);
const httpServer=createServer((req,res)=>{
  if(req.url?.startsWith("/guild"))guildHandler(req,res);else guestHandler(req,res);
});
const gameServer = new Server({ transport: new WebSocketTransport({server:httpServer}) });

gameServer.define(ROOM_NAME, authenticatedRoom(guests));
gameServer.onShutdown(()=>database.close());
try {
  await gameServer.listen(port);
} catch(error) {
  database.close();
  await gameServer.gracefullyShutdown(false);
  throw error;
}
console.log(`GuildToGlory game server listening on port ${port}`);