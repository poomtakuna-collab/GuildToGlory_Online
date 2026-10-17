import { describe, expect, it, vi } from "vitest";
vi.mock("@guild-to-glory/shared",async()=>import("../src/index.js"));
import { createGuild } from "../src/guild.js";
import { generateAdventurer } from "../src/adventurer.js";
import { createPartySnapshot, parsePartySnapshot } from "../src/partyNetwork.js";
import { PartySessions } from "../../server/src/partySessions.js";
import { getOrCreateLocalProfile, LOCAL_PROFILE_STORAGE_KEY } from "../../client/src/localProfile.js";
import { createGuildRepository, GUILD_STORAGE_KEY } from "../../client/src/guildStorage.js";
import { createPartySync } from "../../client/src/partySync.js";
function guild(count=2) {
  const g=createGuild("Guild Alpha");
  g.roster=Array.from({length:count},()=>({...generateAdventurer(),id:crypto.randomUUID()}));
  g.activeParty={memberIds:g.roster.map(a=>a.id),leaderId:g.roster[0]?.id??null};return g;
}
const snapshot=(count=2,revision=1)=>createPartySnapshot(guild(count),crypto.randomUUID(),revision);
function storage(){const values=new Map<string,string>();return {values,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};}
describe("Local profile and connection synchronization",()=>{
  it("persists profile identity on refresh without rewriting legacy Guild data",()=>{
    const store=storage();const {activeParty,...legacy}=guild();
    const raw=JSON.stringify({...legacy,schemaVersion:2});store.setItem(GUILD_STORAGE_KEY,raw);
    const id=getOrCreateLocalProfile(store);expect(getOrCreateLocalProfile(store)).toBe(id);
    expect(store.getItem(GUILD_STORAGE_KEY)).toBe(raw);
    const loaded=createGuildRepository(()=>store).load();expect(loaded.status).toBe("ready");
    if(loaded.status==="ready")expect(loaded.guild).toEqual({...legacy,schemaVersion:3,activeParty:{memberIds:[],leaderId:null}});
    expect(getOrCreateLocalProfile(storage())).not.toBe(id);
  });
  it("does not replace invalid profile identity or pretend a failed save succeeded",()=>{
    const store=storage();store.setItem(LOCAL_PROFILE_STORAGE_KEY,"bad");
    expect(()=>getOrCreateLocalProfile(store)).toThrow();expect(store.getItem(LOCAL_PROFILE_STORAGE_KEY)).toBe("bad");
    expect(()=>getOrCreateLocalProfile({getItem:()=>null,setItem:()=>{throw Error("denied");}})).toThrow("denied");
  });
  it("sends latest persisted data on sync/reconnect, stops old connection, and excludes private data",async()=>{
    const store=storage();const g=guild();store.setItem(GUILD_STORAGE_KEY,JSON.stringify(g));
    const repo=createGuildRepository(()=>store);const id=getOrCreateLocalProfile(store);const send=vi.fn();const report=vi.fn();
    const sync=createPartySync({send},repo,id,report);await sync.sync();
    expect(send.mock.calls[0]![1]).toEqual(createPartySnapshot(g,id,1));
    g.activeParty={memberIds:[],leaderId:null};store.setItem(GUILD_STORAGE_KEY,JSON.stringify(g));await sync.sync();
    expect(send.mock.calls[1]![1]).toEqual(createPartySnapshot(g,id,2));
    sync.stop();await sync.sync();expect(send).toHaveBeenCalledTimes(2);
    await createPartySync({send},repo,id,report).sync();expect(send.mock.calls[2]![1]).toEqual(createPartySnapshot(g,id,1));
    const serialized=JSON.stringify(send.mock.calls);for(const privateKey of ["gold","pendingRecruit","baseStats","traits","startingSkills"])expect(serialized).not.toContain(privateKey);
  });
  it("reports corrupt Guild without sending fake data; absent Guild sends empty state",async()=>{
    const store=storage();const send=vi.fn();const report=vi.fn();const sync=createPartySync({send},createGuildRepository(()=>store),crypto.randomUUID(),report);
    store.setItem(GUILD_STORAGE_KEY,"corrupt");await sync.sync();expect(send).not.toHaveBeenCalled();expect(report).toHaveBeenCalledWith(expect.stringContaining("Party sync failed"));
    store.values.delete(GUILD_STORAGE_KEY);await sync.sync();expect(send.mock.calls[0]![1]).toMatchObject({guildId:null,guildName:null,memberIds:[],leaderId:null});
  });
});
describe("Party contract and session isolation",()=>{
  it.each([0,1,2,3,4])("supports %i members",count=>expect(parsePartySnapshot(snapshot(count)).memberIds).toHaveLength(count));
  it.each([
    (s:any)=>{s.memberIds.push(...Array(5).fill("extra"));},
    (s:any)=>{s.memberIds[1]=s.memberIds[0];},
    (s:any)=>{s.leaderId="outside";},
    (s:any)=>{s.members[0].id="different";},
    (s:any)=>{s.members[0].name="a".repeat(5000);},
    (s:any)=>{s.guildName="a".repeat(25);},
    (s:any)=>{s.members[0].level="1";},
    (s:any)=>{s.members[0].rarity="God";},
    (s:any)=>{s.revision=0;},(s:any)=>{s.revision=Infinity;},
    (s:any)=>{s.protocolVersion=2;},(s:any)=>{s.profileId="fake";},
    (s:any)=>{s.sessionId="victim";},(s:any)=>{s.gold=100000;},
    (s:any)=>{s.guildId=null;},(s:any)=>{s.members={};},(s:any)=>{s.guildName="bad\nname";}
  ])("rejects invalid payload without throwing out of the session handler",change=>{
    const sessions=new PartySessions();sessions.join("A");const valid=snapshot();sessions.receive("A",valid);
    const bad=structuredClone(valid);change(bad);const before=sessions.state();
    expect(()=>parsePartySnapshot(bad)).toThrow();expect(sessions.receive("A",bad).ok).toBe(false);expect(sessions.state()).toEqual(before);
  });
  it("enforces the UTF-8 byte limit even when individual strings are within bounds",()=>{
    const payload=snapshot(4);
    payload.memberIds=payload.members.map((member,i)=>{
      const id=String.fromCharCode(0x754c).repeat(127)+i;
      member.id=id;member.name=String.fromCharCode(0x754c).repeat(80);return id;
    });
    payload.leaderId=payload.memberIds[0]!;
    expect(new TextEncoder().encode(JSON.stringify(payload)).byteLength).toBeGreaterThan(4096);
    expect(()=>parsePartySnapshot(payload)).toThrow();
  });
  it.each([null,[],true,"x".repeat(5000),{},{members:null}])("rejects malformed payload %j",payload=>{
    const sessions=new PartySessions();sessions.join("A");expect(sessions.receive("A",payload).ok).toBe(false);
  });
  it("keeps A/B independent, ignores duplicates/stale snapshots and clears only disconnected sessions",()=>{
    const sessions=new PartySessions();sessions.join("A");sessions.join("B");const a=snapshot();const b=snapshot(4);
    // Even claiming the same profile is not ownership or shared state.
    b.profileId=a.profileId;
    expect(sessions.receive("A",a).ok).toBe(true);expect(sessions.receive("B",b).ok).toBe(true);
    const beforeB=sessions.state().parties[1];
    expect(sessions.receive("A",{...a,revision:3,leaderId:null}).ok).toBe(true);
    expect(sessions.receive("A",{...a,revision:2}).ok).toBe(false);
    expect(sessions.receive("A",{...a,revision:3}).ok).toBe(false);
    expect(sessions.state().parties).toHaveLength(2);expect(sessions.state().parties[0]!.ready).toBe(false);
    expect(sessions.state().parties[1]).toEqual(beforeB);
    expect(JSON.stringify(sessions.state())).not.toContain(a.profileId);
    sessions.leave("A");expect(sessions.state().parties).toEqual([beforeB]);expect(sessions.receive("A",a).ok).toBe(false);
    sessions.join("new A");expect(sessions.receive("new A",a).ok).toBe(true);
  });
});
