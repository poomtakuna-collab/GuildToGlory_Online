import {afterEach,expect,it,vi} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createServer} from "node:http";
vi.mock("@guild-to-glory/shared",async()=>import("../src/index.js"));
import {GuildDatabase} from "../../server/src/database/database.js";
import {GuildRepository} from "../../server/src/database/repository.js";
import {GuildService} from "../../server/src/guild/service.js";
import {guildHttp} from "../../server/src/guild/http.js";
import {Guests} from "../../server/src/auth/guests.js";
import {createGuildApi} from "../../client/src/guildApi.js";
import {createGuild,type GuildAction,type GuildCommand} from "../src/index.js";
import {generateAdventurer} from "../src/adventurer.js";
const paths:string[]=[],dbs:GuildDatabase[]=[];
function fixture(mode="development",legacy=true){
 const dir=mkdtempSync(join(tmpdir(),"server-guild-test-"));paths.push(dir);const path=join(dir,"db.sqlite");const db=new GuildDatabase(path);dbs.push(db);
 const repo=new GuildRepository(db),service=new GuildService(repo,mode,legacy),guests=new Guests(db),a=guests.create(),b=guests.create();
 const command=(action:GuildAction,player=a.playerId):GuildCommand=>({requestId:crypto.randomUUID(),expectedRevision:service.get(player).revision,action});
 const act=(action:GuildAction,player=a.playerId)=>service.execute(player,command(action,player));
 return {db,path,repo,service,guests,a,b,command,act};
}
function legacyGuild(count=0){const g=createGuild("Legacy Guild");g.roster=Array.from({length:count},()=>({...generateAdventurer(),id:crypto.randomUUID()}));return g;}
afterEach(()=>{for(const db of dbs.splice(0))db.close();for(const path of paths.splice(0))rmSync(path,{recursive:true,force:true});});
it("isolates accounts, creates once, grants starting gold once and rejects client ownership fields",()=>{
 const f=fixture();const c=f.command({type:"create",name:"Guild Alpha"});const first=f.service.execute(f.a.playerId,c);
 expect(first.guild).toMatchObject({gold:40000,level:1,roster:[],activeParty:{memberIds:[],leaderId:null}});
 expect(f.service.execute(f.a.playerId,c).guild).toEqual(first.guild);expect(f.act({type:"create",name:"Duplicate"}).ok).toBe(false);
 const other=f.act({type:"create",name:"Guild Beta"},f.b.playerId);expect(other.guild?.id).not.toBe(first.guild?.id);
 expect(()=>f.service.execute(f.a.playerId,{...f.command({type:"debugGold"}),ownerPlayerId:f.b.playerId})).toThrow();
 expect(f.service.get(f.b.playerId).guild).toEqual(other.guild);
 expect(f.act({type:"debugGold"}).guild?.gold).toBe(140000);expect(f.service.get(f.b.playerId).guild?.gold).toBe(40000);
});
it("charges a roll once even after retry following reject, and rejects conflicting request reuse",()=>{
 const f=fixture();f.act({type:"create",name:"Guild"});const roll=f.command({type:"recruitment",action:{type:"roll"}});
 const rolled=f.service.execute(f.a.playerId,roll);expect(rolled.guild?.gold).toBe(30000);
 expect(f.service.execute(f.a.playerId,roll).guild?.pendingRecruit).toEqual(rolled.guild?.pendingRecruit);
 expect(f.act({type:"recruitment",action:{type:"roll"}}).ok).toBe(false);
 f.act({type:"recruitment",action:{type:"reject",id:rolled.guild!.pendingRecruit!.id}});
 const retry=f.service.execute(f.a.playerId,roll);expect(retry.guild?.gold).toBe(30000);expect(retry.guild?.pendingRecruit).toBeNull();
 expect(f.service.execute(f.a.playerId,{...roll,action:{type:"debugGold"}}).error?.code).toBe("REQUEST_ID_REUSED");
 expect(()=>f.service.execute(f.a.playerId,{...roll,action:{type:"recruitment",action:{type:"roll",gold:100000}}})).toThrow();
});
it("enforces insufficient gold, roster capacity, recruit/reject/dismiss and party/leader rules",()=>{
 const f=fixture();const g=legacyGuild(8);g.pendingRecruit={...generateAdventurer(),id:crypto.randomUUID()};
 expect(f.act({type:"importLegacy",guild:g}).ok).toBe(true);
 expect(f.act({type:"recruitment",action:{type:"recruit",id:g.pendingRecruit.id}}).ok).toBe(false);
 for(const member of g.roster.slice(0,4))expect(f.act({type:"party",action:{type:"add",id:member.id}}).ok).toBe(true);
 expect(f.act({type:"party",action:{type:"add",id:g.roster[4]!.id}}).ok).toBe(false);
 expect(f.act({type:"party",action:{type:"add",id:g.roster[0]!.id}}).ok).toBe(false);
 expect(f.act({type:"party",action:{type:"setLeader",id:g.roster[4]!.id}}).ok).toBe(false);
 expect(f.act({type:"party",action:{type:"setLeader",id:g.roster[0]!.id}}).ok).toBe(true);
 const dismiss=f.command({type:"recruitment",action:{type:"dismiss",id:g.roster[0]!.id}});
 const removed=f.service.execute(f.a.playerId,dismiss);expect(removed.guild?.activeParty.leaderId).toBeNull();expect(removed.guild?.activeParty.memberIds).toHaveLength(3);
 expect(f.service.execute(f.a.playerId,dismiss).guild?.roster).toHaveLength(7);
 expect(f.act({type:"recruitment",action:{type:"recruit",id:g.pendingRecruit.id}}).guild?.roster).toHaveLength(8);
 expect(f.service.get(f.a.playerId).guild?.gold).toBe(g.gold);
 f.repo.updateGuild(g.id,{gold:9999});expect(f.act({type:"recruitment",action:{type:"roll"}}).ok).toBe(false);
});
it("serializes concurrent connections and rejects stale revisions before a second roll",async()=>{
 const f=fixture();f.act({type:"create",name:"Guild"});const c=f.command({type:"recruitment",action:{type:"roll"}}),other={...c,requestId:crypto.randomUUID()};
 const second=new GuildDatabase(f.path);dbs.push(second);const otherService=new GuildService(new GuildRepository(second),"development");
 const results=await Promise.all([Promise.resolve().then(()=>f.service.execute(f.a.playerId,c)),Promise.resolve().then(()=>otherService.execute(f.a.playerId,other))]);
 expect(results.filter(r=>r.ok)).toHaveLength(1);expect(results[1]!.error?.code).toBe("CONFLICT");expect(f.service.get(f.a.playerId).guild?.gold).toBe(30000);
});
it("rolls back gold and pending on write failure and journals a stable failure outcome",()=>{
 const f=fixture();f.act({type:"create",name:"Guild"});const before=f.service.get(f.a.playerId);const c=f.command({type:"recruitment",action:{type:"roll"}});
 f.db.connection.exec("CREATE TRIGGER fail_pending BEFORE INSERT ON pending_recruits BEGIN SELECT RAISE(ABORT,'failure'); END;");
 expect(f.service.execute(f.a.playerId,c).ok).toBe(false);expect(f.service.get(f.a.playerId)).toEqual(before);
 f.db.connection.exec("DROP TRIGGER fail_pending");expect(f.service.execute(f.a.playerId,c).ok).toBe(false);expect(f.service.get(f.a.playerId)).toEqual(before);
 expect(f.act({type:"recruitment",action:{type:"roll"}}).ok).toBe(true);
});
it("persists full data and deduplication receipts across restart",()=>{
 const f=fixture();const g=legacyGuild(4);g.gold=87654;g.pendingRecruit={...generateAdventurer(),id:crypto.randomUUID()};g.activeParty={memberIds:g.roster.map(a=>a.id),leaderId:g.roster[0]!.id};
 const command=f.command({type:"importLegacy",guild:g});expect(f.service.execute(f.a.playerId,command).guild).toEqual(g);f.db.close();
 const restarted=new GuildDatabase(f.path);dbs.push(restarted);const s=new GuildService(new GuildRepository(restarted),"development",true);
 expect(s.get(f.a.playerId).guild).toEqual(g);expect(s.execute(f.a.playerId,command).guild).toEqual(g);expect(s.get(f.a.playerId).revision).toBe(1);
});
it("validates import, rejects duplicates/cross-account ID collisions and rolls back partial import",()=>{
 const f=fixture();const g=legacyGuild(2);expect(f.act({type:"importLegacy",guild:g}).ok).toBe(true);
 expect(f.act({type:"importLegacy",guild:g}).ok).toBe(false);expect(f.act({type:"importLegacy",guild:g},f.b.playerId).ok).toBe(false);expect(f.service.get(f.b.playerId).guild).toBeNull();
 const invalid={...g,id:crypto.randomUUID(),activeParty:{memberIds:["missing"],leaderId:null}};
 expect(()=>f.act({type:"importLegacy",guild:invalid},f.b.playerId)).toThrow();
 const collision={...g,id:crypto.randomUUID()};expect(f.act({type:"importLegacy",guild:collision},f.b.playerId).ok).toBe(false);expect(f.service.get(f.b.playerId).guild).toBeNull();
});
it.each(["production",undefined,"test"])("denies debug gold and import when server mode is %s",mode=>{
 const f=fixture(mode as string);const service=new GuildService(f.repo,mode,true);
 f.act({type:"create",name:"Guild"});
 expect(service.execute(f.a.playerId,f.command({type:"debugGold"})).ok).toBe(false);
 expect(service.execute(f.b.playerId,f.command({type:"importLegacy",guild:legacyGuild()},f.b.playerId)).ok).toBe(false);
 expect(service.get(f.a.playerId).guild?.gold).toBe(40000);expect(service.get(f.b.playerId).guild).toBeNull();
});
it("requires explicit legacy flag and leaves Party B unchanged after Party A changes",()=>{
 const f=fixture("development",false);expect(f.act({type:"importLegacy",guild:legacyGuild()}).ok).toBe(false);
 const a=legacyGuild(2),b=legacyGuild(2);f.repo.saveGuildSnapshot(f.a.playerId,a);f.repo.saveGuildSnapshot(f.b.playerId,b);
 expect(f.act({type:"party",action:{type:"add",id:b.roster[0]!.id}}).ok).toBe(false);
 expect(f.act({type:"party",action:{type:"add",id:a.roster[0]!.id}}).ok).toBe(true);expect(f.service.get(f.b.playerId).guild).toEqual(b);
});
function store(){const m=new Map<string,string>();return {getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);},removeItem:(k:string)=>{m.delete(k);}};}
it("authenticated HTTP and client recover a lost response after reload without executing twice",async()=>{
 const f=fixture();const server=createServer(guildHttp(f.guests,f.service,["http://localhost:5173"]));await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url="http://127.0.0.1:"+(server.address() as {port:number}).port;
 const session=store();let lose=false;
 const request:typeof fetch=async(...args)=>{const response=await fetch(...args);if(lose){lose=false;await response.text();throw Error("Lost response");}return response;};
 const account={ensure:async()=>f.a.credential};const api=createGuildApi(url,account,()=>session,request);
 try {
  expect((await fetch(url+"/guild")).status).toBe(401);
  await api.load();expect((await api.command({type:"create",name:"HTTP Guild"})).ok).toBe(true);
  lose=true;await expect(api.command({type:"recruitment",action:{type:"roll"}})).rejects.toThrow("Lost response");expect(f.service.get(f.a.playerId).guild?.gold).toBe(30000);
  await expect(api.command({type:"debugGold"})).rejects.toThrow(/unresolved/);
  const reloaded=createGuildApi(url,account,()=>session,request);await reloaded.load();expect(reloaded.hasPending()).toBe(true);
  const result=await reloaded.retry();expect(result.guild?.gold).toBe(30000);expect(result.guild?.pendingRecruit).not.toBeNull();expect(reloaded.hasPending()).toBe(false);
  const b=createGuildApi(url,{ensure:async()=>f.b.credential},store);expect((await b.load()).guild).toBeNull();
  const forged=await fetch(url+"/guild",{method:"POST",headers:{Authorization:"Bearer "+f.b.credential,"Content-Type":"application/json"},body:JSON.stringify({...f.command({type:"debugGold"}),ownerPlayerId:f.a.playerId})});expect(forged.status).toBe(400);
  const huge=await fetch(url+"/guild",{method:"POST",headers:{Authorization:"Bearer "+f.a.credential,"Content-Type":"application/json"},body:"x".repeat(262145)});expect(huge.status).toBe(413);
  expect(f.service.get(f.a.playerId).guild?.gold).toBe(30000);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

it("upgrades v2 without losing authenticated owners or existing Guild data",()=>{
 const f=fixture();const g=legacyGuild(1);f.repo.saveGuildSnapshot(f.a.playerId,g);
 f.db.connection.exec("DROP TABLE guild_commands; DROP TABLE guild_revisions; DELETE FROM schema_migrations WHERE version=3;");f.db.close();
 const reopened=new GuildDatabase(f.path);dbs.push(reopened);
 expect(new Guests(reopened).authenticate(f.a.credential)).toEqual({playerId:f.a.playerId});
 expect(new GuildService(new GuildRepository(reopened),"production").get(f.a.playerId).guild).toEqual(g);
});
it("production HTTP rejects manually submitted debug and legacy requests",async()=>{
 const f=fixture("production");f.act({type:"create",name:"Production Guild"});
 const server=createServer(guildHttp(f.guests,f.service,[]));await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url="http://127.0.0.1:"+(server.address() as {port:number}).port+"/guild";
 try {
  for(const action of [{type:"debugGold"},{type:"importLegacy",guild:legacyGuild()}] as GuildAction[]) {
   const response=await fetch(url,{method:"POST",headers:{Authorization:"Bearer "+f.a.credential,"Content-Type":"application/json"},body:JSON.stringify(f.command(action))});
   expect(response.status).toBe(200);expect(await response.json()).toMatchObject({ok:false,error:{code:"DISABLED"}});
  }
  expect(f.service.get(f.a.playerId).guild?.gold).toBe(40000);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
