import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
vi.mock("@guild-to-glory/shared",async()=>import("../src/index.js"));
import { GuildDatabase } from "../../server/src/database/database.js";
import { GuildRepository } from "../../server/src/database/repository.js";
import { Guests, RateLimit } from "../../server/src/auth/guests.js";
import { guestHttp } from "../../server/src/auth/http.js";
import { createGuestAccountClient, GUEST_CREDENTIAL_KEY } from "../../client/src/guestAccount.js";
import { generateAdventurer } from "../src/adventurer.js";
const paths:string[]=[],databases:GuildDatabase[]=[];
function fixture(){const dir=mkdtempSync(join(tmpdir(),"guild-guest-test-"));paths.push(dir);const path=join(dir,"test.sqlite");const db=new GuildDatabase(path);databases.push(db);return {db,path,guests:new Guests(db)};}
function storage(){const values=new Map<string,string>();return {values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};}
afterEach(()=>{for(const db of databases.splice(0))db.close();for(const path of paths.splice(0))rmSync(path,{recursive:true,force:true});});
describe("Guest accounts",()=>{
  it("creates unique server identities and stores only SHA-256 credential hashes",()=>{
    const {db,guests}=fixture();const a=guests.create(),b=guests.create();
    expect(a.playerId).not.toBe(b.playerId);expect(a.credential).not.toBe(b.credential);expect(a.credential).toMatch(/^[a-f0-9]{64}$/);
    const rows=db.connection.prepare("SELECT * FROM guest_credentials").all();
    expect(rows).toHaveLength(2);expect(JSON.stringify(rows)).not.toContain(a.credential);
    expect(rows.find(r=>r.player_id===a.playerId)!.credential_hash).toBe(createHash("sha256").update(a.credential).digest("hex"));
    expect(guests.authenticate(a.credential)).toEqual({playerId:a.playerId});
    for(const bad of [a.playerId,"0".repeat(64),null,{},"a".repeat(10000),a.credential+"extra"])expect(guests.authenticate(bad)).toBeNull();
    expect(db.connection.prepare("SELECT count(*) AS n FROM players").get()!.n).toBe(2);
    expect(db.connection.prepare("SELECT count(*) AS n FROM guilds").get()!.n).toBe(0);
  });
  it("authenticates the same account after database restart",()=>{
    const {db,path,guests}=fixture();const account=guests.create();db.close();
    const reopened=new GuildDatabase(path);databases.push(reopened);expect(new Guests(reopened).authenticate(account.credential)).toEqual({playerId:account.playerId});
  });
  it("rolls back account creation if credential storage fails",()=>{
    const {db,guests}=fixture();db.connection.exec("CREATE TRIGGER fail_guest BEFORE INSERT ON guest_credentials BEGIN SELECT RAISE(ABORT,'write failure'); END;");
    expect(()=>guests.create()).toThrow();expect(db.connection.prepare("SELECT count(*) AS n FROM players").get()!.n).toBe(0);
  });
  it("migrates v1 data without modifying existing Guild, roster, pending or party",()=>{
    const {db,path}=fixture();const repo=new GuildRepository(db);const player=repo.createPlayer();const g=repo.createGuild({ownerPlayerId:player.id,name:"Existing Guild",level:3,gold:23456});
    const member={...generateAdventurer(),id:crypto.randomUUID()},pending={...generateAdventurer(),id:crypto.randomUUID()};
    repo.saveRoster(g.id,[member]);repo.savePendingRecruit(g.id,pending);repo.saveActiveParty(g.id,{memberIds:[member.id],leaderId:member.id});
    db.connection.exec("DROP TABLE guild_commands; DROP TABLE guild_revisions; DROP TABLE guest_credentials; DELETE FROM schema_migrations WHERE version>=2;");db.close();
    const reopened=new GuildDatabase(path);databases.push(reopened);const r=new GuildRepository(reopened);
    expect(r.findGuild(g.id)).toEqual(g);expect(r.findPlayer(player.id)).toEqual(player);expect(r.loadRoster(g.id)).toEqual([member]);
    expect(r.loadPendingRecruit(g.id)).toEqual(pending);expect(r.loadActiveParty(g.id)).toEqual({memberIds:[member.id],leaderId:member.id});
    expect(reopened.connection.prepare("SELECT count(*) AS n FROM guest_credentials").get()!.n).toBe(0);
  });
  it("limits abuse with expiration and per-address separation",()=>{
    const limiter=new RateLimit(2,1000);expect(limiter.allow("a",0)).toBe(true);expect(limiter.allow("a",1)).toBe(true);expect(limiter.allow("a",2)).toBe(false);
    expect(limiter.allow("b",2)).toBe(true);expect(limiter.allow("a",1000)).toBe(true);
  });
});
describe("Browser guest initialization",()=>{
  it("deduplicates concurrent initialization, retains identity on refresh and separates profiles",async()=>{
    const {guests}=fixture();const store=storage();store.setItem("guild-to-glory.guild","existing Guild");
    const request=vi.fn(async()=>guests.create());const client=createGuestAccountClient(()=>store,request);
    const credentials=await Promise.all(Array.from({length:10},()=>client.ensure()));expect(new Set(credentials).size).toBe(1);expect(request).toHaveBeenCalledTimes(1);
    expect(await createGuestAccountClient(()=>store,request).ensure()).toBe(credentials[0]);expect(request).toHaveBeenCalledTimes(1);
    const other=await createGuestAccountClient(storage,request).ensure();expect(guests.authenticate(other)?.playerId).not.toBe(guests.authenticate(credentials[0])?.playerId);
    expect(store.getItem("guild-to-glory.guild")).toBe("existing Guild");
  });
  it("serializes two tabs with a shared lock and rereads persisted credentials inside the lock",async()=>{
    const {guests}=fixture();const store=storage();let tail=Promise.resolve("");
    const lock=(_name:string,work:()=>Promise<string>)=>{const next=tail.then(work);tail=next;return next;};
    const request=vi.fn(async()=>guests.create());const a=createGuestAccountClient(()=>store,request,lock),b=createGuestAccountClient(()=>store,request,lock);
    const [first,second]=await Promise.all([a.ensure(),b.ensure()]);expect(first).toBe(second);expect(request).toHaveBeenCalledTimes(1);
  });
  it("preserves existing invalid credentials and allows retry after server failure without replacement",async()=>{
    const store=storage();store.setItem(GUEST_CREDENTIAL_KEY,"invalid");const request=vi.fn(async()=>{throw Error("offline");});
    const client=createGuestAccountClient(()=>store,request);await expect(client.ensure()).rejects.toThrow(/Invalid stored/);
    expect(store.getItem(GUEST_CREDENTIAL_KEY)).toBe("invalid");expect(request).not.toHaveBeenCalled();
    store.values.delete(GUEST_CREDENTIAL_KEY);await expect(client.ensure()).rejects.toThrow("offline");expect(store.getItem(GUEST_CREDENTIAL_KEY)).toBeNull();
    request.mockImplementation(async()=>({credential:"a".repeat(64)}) as never);expect(await client.ensure()).toBe("a".repeat(64));
  });
  it("does not create another account when a credential save fails and is retried",async()=>{
    const {guests}=fixture();const store=storage();const save=vi.spyOn(store,"setItem").mockImplementationOnce(()=>{throw Error("quota");});const request=vi.fn(async()=>guests.create());
    const client=createGuestAccountClient(()=>store,request);await expect(client.ensure()).rejects.toThrow("quota");await client.ensure();expect(request).toHaveBeenCalledTimes(1);expect(save).toHaveBeenCalledTimes(2);
  });
});
it("HTTP guest creation enforces origin, payload limits, no-store and creation rate limits",async()=>{
  const {guests}=fixture();const server=createServer(guestHttp(guests,["https://game.example"]));
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const url="http://127.0.0.1:"+(server.address() as {port:number}).port+"/guest-account";
  const post=(body:string,origin="https://game.example")=>fetch(url,{method:"POST",headers:{"Content-Type":"application/json",Origin:origin},body});
  try {
    expect((await post("{}","https://evil.example")).status).toBe(403);
    expect((await post(JSON.stringify({playerId:"forged"}))).status).toBe(400);
    expect((await post("x".repeat(200))).status).toBe(413);
    const response=await post("{}");expect(response.status).toBe(201);expect(response.headers.get("cache-control")).toBe("no-store");
    const account=await response.json() as {credential:string;playerId:string};expect(guests.authenticate(account.credential)).toEqual({playerId:account.playerId});
    await post("{}");await post("{}");expect((await post("{}")).status).toBe(429);
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
