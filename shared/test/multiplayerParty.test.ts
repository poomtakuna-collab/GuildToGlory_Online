import { expect, it, vi } from "vitest";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
vi.mock("@guild-to-glory/shared",async()=>import("../src/index.js"));
import { ConnectionRoom } from "../../server/src/rooms/ConnectionRoom.js";
import { NETWORK_MESSAGES, ROOM_NAME } from "../src/messages.js";
import { createPartySnapshot, type PartyStateMessage } from "../src/partyNetwork.js";
import { createGuild } from "../src/guild.js";
import { generateAdventurer } from "../src/adventurer.js";

it("real Colyseus clients isolate parties, move on map 1-1, reject bad data and reconnect",async()=>{
  const transport=new WebSocketTransport();
  const server=new Server({transport,greet:false,gracefullyShutdown:false});
  server.define(ROOM_NAME,ConnectionRoom);
  const rooms:Room[]=[];
  try {
    await server.listen(0,"127.0.0.1");
    const address=transport.server!.address() as {port:number};
    const url="ws://127.0.0.1:"+address.port;
    async function connect(){
      const room=await new Client(url).joinOrCreate(ROOM_NAME);rooms.push(room);
      const seen={parties:[] as PartyStateMessage["parties"],players:[] as any[],results:[] as any[],map:null as any};
      room.onMessage(NETWORK_MESSAGES.partyState,m=>{seen.parties=m.parties;});
      room.onMessage(NETWORK_MESSAGES.worldState,m=>{seen.players=m.players;});
      room.onMessage(NETWORK_MESSAGES.worldMap,m=>{seen.map=m;});
      room.onMessage(NETWORK_MESSAGES.partyResult,m=>{seen.results.push(m);});
      room.send(NETWORK_MESSAGES.worldSync);return {room,seen};
    }
    const a=await connect();const b=await connect();expect(a.room.roomId).toBe(b.room.roomId);
    const ga=createGuild("Guild Alpha");ga.roster=[{...generateAdventurer(),id:crypto.randomUUID()}];
    ga.activeParty={memberIds:[ga.roster[0]!.id],leaderId:ga.roster[0]!.id};
    const sa=createPartySnapshot(ga,crypto.randomUUID(),1);
    const sb=createPartySnapshot(createGuild("Guild Beta"),crypto.randomUUID(),1);
    a.room.send(NETWORK_MESSAGES.partySnapshot,sa);b.room.send(NETWORK_MESSAGES.partySnapshot,sb);
    await vi.waitFor(()=>{expect(a.seen.parties.find(p=>p.sessionId===a.room.sessionId)?.guildName).toBe("Guild Alpha");expect(a.seen.parties.find(p=>p.sessionId===b.room.sessionId)?.guildName).toBe("Guild Beta");});
    expect(a.seen.map.mapId).toBe("1-1");expect(b.seen.map.mapId).toBe("1-1");
    const bParty=structuredClone(a.seen.parties.find(p=>p.sessionId===b.room.sessionId));
    a.room.send(NETWORK_MESSAGES.partySnapshot,{...sa,revision:3,leaderId:null});
    await vi.waitFor(()=>expect(a.seen.results.at(-1)).toMatchObject({ok:true,revision:3}));
    a.room.send(NETWORK_MESSAGES.partySnapshot,{...sa,revision:2});
    await vi.waitFor(()=>expect(a.seen.results.at(-1)).toMatchObject({ok:false,revision:2}));
    a.room.send(NETWORK_MESSAGES.partySnapshot,{...sa,sessionId:b.room.sessionId});
    await vi.waitFor(()=>expect(a.seen.results.at(-1)).toMatchObject({ok:false,revision:null}));
    expect(a.seen.parties.find(p=>p.sessionId===a.room.sessionId)?.ready).toBe(false);
    a.room.send(NETWORK_MESSAGES.destination,{column:2,row:1});
    await vi.waitFor(()=>expect(b.seen.players.find(p=>p.id===a.room.sessionId)?.x).toBe(2));
    expect(b.seen.players.find(p=>p.id===b.room.sessionId)).toMatchObject({x:1,y:1});
    expect(a.seen.parties.find(p=>p.sessionId===b.room.sessionId)).toEqual(bParty);
    await a.room.leave();await vi.waitFor(()=>expect(b.seen.parties.map(p=>p.sessionId)).toEqual([b.room.sessionId]));
    const reconnected=await connect();reconnected.room.send(NETWORK_MESSAGES.partySnapshot,sa);
    await vi.waitFor(()=>expect(b.seen.parties.find(p=>p.sessionId===reconnected.room.sessionId)?.guildName).toBe("Guild Alpha"));
    expect(b.seen.parties).toHaveLength(2);
  } finally {
    await Promise.all(rooms.filter(room=>room.connection.isOpen).map(room=>room.leave().catch(()=>{})));
    await server.gracefullyShutdown(false);
  }
},15000);
