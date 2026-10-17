import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
vi.mock("@guild-to-glory/shared",async()=>import("../src/index.js"));
import { GuildDatabase, databasePath } from "../../server/src/database/database.js";
import { GuildRepository } from "../../server/src/database/repository.js";
import { migrate, MIGRATIONS } from "../../server/src/database/migrations.js";
import { generateAdventurer } from "../src/adventurer.js";
const directories:string[]=[];
const databases:GuildDatabase[]=[];
function fixture(){
  const directory=mkdtempSync(join(tmpdir(),"guild-db-test-"));directories.push(directory);
  const path=join(directory,"nested","test.sqlite");
  const db=new GuildDatabase(path);databases.push(db);
  return {db,repo:new GuildRepository(db),path};
}
function character(){return {...generateAdventurer(),id:crypto.randomUUID()};}
function guild(repo:GuildRepository,name="Guild Alpha"){
  return repo.createGuild({ownerPlayerId:repo.createPlayer().id,name,level:1,gold:12345});
}
afterEach(()=>{for(const db of databases.splice(0))db.close();for(const path of directories.splice(0))rmSync(path,{recursive:true,force:true});});
describe("SQLite foundation",()=>{
  it("initializes schema version 1 with foreign keys, WAL and no seeded accounts or gold",()=>{
    const {db}=fixture();
    expect(db.connection.prepare("PRAGMA foreign_keys").get()!.foreign_keys).toBe(1);
    expect(db.connection.prepare("PRAGMA journal_mode").get()!.journal_mode).toBe("wal");
    expect(db.connection.prepare("SELECT version,name FROM schema_migrations").all()).toEqual([{version:1,name:"guild_foundation"}]);
    for(const table of ["players","guilds","adventurers","pending_recruits","active_parties","active_party_members"])
      expect(db.connection.prepare("SELECT count(*) AS count FROM "+table).get()!.count).toBe(0);
  });
  it("uses configurable paths relative to server and rejects empty/unsafe extensions",()=>{
    expect(databasePath("custom/a.sqlite")).toMatch(/server[\\/]custom[\\/]a.sqlite$/);
    expect(databasePath(resolve("sample.db"))).toBe(resolve("sample.db"));
    expect(()=>databasePath("")).toThrow();expect(()=>databasePath("client.json")).toThrow();
    expect(()=>databasePath("../client/public/secret.sqlite")).toThrow(/outside/);
  });
  it("reopens persisted players, Guild data, full roster, pending and Party without resetting or reseeding",()=>{
    const {db,repo,path}=fixture();const g=guild(repo);const roster=[character(),character()];const pending=character();
    repo.saveRoster(g.id,roster);repo.savePendingRecruit(g.id,pending);
    repo.saveActiveParty(g.id,{memberIds:roster.map(a=>a.id),leaderId:roster[1]!.id});
    const party=repo.loadActiveParty(g.id);db.close();db.close();
    const restarted=new GuildDatabase(path);databases.push(restarted);const r=new GuildRepository(restarted);
    expect(r.findPlayer(g.owner_player_id)).not.toBeNull();expect(r.findGuild(g.id)).toEqual(g);
    expect(r.loadRoster(g.id)).toEqual(roster);expect(r.loadPendingRecruit(g.id)).toEqual(pending);expect(r.loadActiveParty(g.id)).toEqual(party);
    expect(restarted.connection.prepare("SELECT count(*) AS count FROM schema_migrations").get()!.count).toBe(1);
  });
  it("applies a later migration once and rolls back a failed migration and version record",()=>{
    const {db,repo}=fixture();const g=guild(repo);
    const v2={version:2,name:"test_extension",sql:"CREATE TABLE extension(value TEXT) STRICT;"};
    migrate(db.connection,[...MIGRATIONS,v2]);migrate(db.connection,[...MIGRATIONS,v2]);
    expect(()=>migrate(db.connection,[...MIGRATIONS,v2,{version:3,name:"broken",sql:"CREATE TABLE partial(id TEXT); INVALID SQL;"}])).toThrow();
    expect(db.connection.prepare("SELECT name FROM sqlite_master WHERE name='partial'").get()).toBeUndefined();
    expect(db.connection.prepare("SELECT max(version) AS version FROM schema_migrations").get()!.version).toBe(2);
    expect(repo.findGuild(g.id)).toEqual(g);
  });
  it("refuses unknown migration history without overwriting existing data",()=>{
    const {db,repo,path}=fixture();const g=guild(repo);
    db.connection.prepare("INSERT INTO schema_migrations VALUES (99,'future',?)").run(new Date().toISOString());db.close();
    expect(()=>new GuildDatabase(path)).toThrow(/migration history/);
    const raw=new DatabaseSync(path);try{expect(raw.prepare("SELECT gold FROM guilds WHERE id=?").get(g.id)!.gold).toBe(g.gold);}finally{raw.close();}
  });
  it("preserves corrupt files and reports errors; closed connections reject operations",()=>{
    const {db,repo,path}=fixture();db.close();const invalid=Buffer.from("not a SQLite database");writeFileSync(path,invalid);
    expect(()=>new GuildDatabase(path)).toThrow();expect(readFileSync(path)).toEqual(invalid);
    expect(()=>repo.createPlayer()).toThrow();
  });
});
describe("Persistence repositories",()=>{
  it("creates/finds players and keeps two independently owned Guilds",()=>{
    const {repo}=fixture();const a=guild(repo),b=guild(repo,"Guild Beta");
    expect(repo.findPlayer(a.owner_player_id)?.id).toBe(a.owner_player_id);expect(repo.findPlayer("absent")).toBeNull();
    expect(repo.findGuildByPlayer(a.owner_player_id)).toEqual(a);expect(repo.findGuildByPlayer(b.owner_player_id)).toEqual(b);
    expect(()=>repo.createGuild({ownerPlayerId:a.owner_player_id,name:"Duplicate",level:1,gold:0})).toThrow();
    expect(()=>repo.createPlayer(a.owner_player_id)).toThrow();expect(repo.findGuildByPlayer(a.owner_player_id)).toEqual(a);
  });
  it("updates Guild gold/level and binds SQL-like input as data",()=>{
    const {repo}=fixture();const g=guild(repo);const updated=repo.updateGuild(g.id,{name:"O'Brien Guild",gold:76543,level:7});
    expect(repo.findGuild(g.id)).toEqual(updated);expect(updated).toMatchObject({gold:76543,level:7,created_at:g.created_at});
    const player=repo.createPlayer("'); DROP TABLE guilds;--");expect(repo.findPlayer(player.id)).toEqual(player);
    for(const gold of [-1,NaN,Infinity,1.5])expect(()=>repo.updateGuild(g.id,{gold})).toThrow();
    expect(repo.findGuild(g.id)).toEqual(updated);expect(()=>repo.updateGuild("missing",{gold:0})).toThrow();
  });
  it("round trips eight generated adventurers including all stats/skills/traits and preserves ordering",()=>{
    const {repo}=fixture();const g=guild(repo);const roster=Array.from({length:8},character);
    repo.saveRoster(g.id,roster);expect(repo.loadRoster(g.id)).toEqual(roster);
    repo.saveRoster(g.id,[...roster].reverse());expect(repo.loadRoster(g.id)).toEqual([...roster].reverse());
    expect(()=>repo.saveRoster(g.id,[roster[0]!,roster[0]!])).toThrow();expect(()=>repo.saveRoster(g.id,[{...roster[0]!,baseStats:{} as any}])).toThrow();
    expect(repo.loadRoster(g.id)).toEqual([...roster].reverse());
  });
  it("saves only one pending recruit, replaces explicitly and clears without changing gold",()=>{
    const {db,repo}=fixture();const g=guild(repo);const first=character(),second=character();
    repo.savePendingRecruit(g.id,first);expect(repo.loadPendingRecruit(g.id)).toEqual(first);
    repo.savePendingRecruit(g.id,second);expect(repo.loadPendingRecruit(g.id)).toEqual(second);
    expect(db.connection.prepare("SELECT count(*) AS count FROM pending_recruits").get()!.count).toBe(1);
    expect(()=>db.connection.prepare("INSERT INTO pending_recruits VALUES (?,?,?)").run(g.id,JSON.stringify(first),"now")).toThrow();
    repo.clearPendingRecruit(g.id);repo.clearPendingRecruit(g.id);expect(repo.loadPendingRecruit(g.id)).toBeNull();expect(repo.findGuild(g.id)?.gold).toBe(g.gold);
  });
  it.each([0,1,2,3,4])("saves/loads a Party of %i members with nullable leader",count=>{
    const {repo}=fixture();const g=guild(repo);const roster=Array.from({length:4},character);repo.saveRoster(g.id,roster);
    const memberIds=roster.slice(0,count).map(a=>a.id);repo.saveActiveParty(g.id,{memberIds,leaderId:null});
    expect(repo.loadActiveParty(g.id)).toEqual({memberIds,leaderId:null});
    if(count){repo.saveActiveParty(g.id,{memberIds,leaderId:memberIds[count-1]!});expect(repo.loadActiveParty(g.id).leaderId).toBe(memberIds[count-1]);}
  });
  it("rejects duplicate members, excess capacity, foreign members/leaders and invalid references",()=>{
    const {repo}=fixture();const a=guild(repo),b=guild(repo,"Guild Beta");const roster=Array.from({length:5},character),other=character();
    repo.saveRoster(a.id,roster);repo.saveRoster(b.id,[other]);const member=roster[0]!.id;
    const valid={memberIds:[member],leaderId:member};repo.saveActiveParty(a.id,valid);
    for(const party of [{memberIds:[member,member],leaderId:null},{memberIds:roster.map(a=>a.id),leaderId:null},
      {memberIds:[other.id],leaderId:null},{memberIds:[member],leaderId:other.id},{memberIds:["absent"],leaderId:null}])
      expect(()=>repo.saveActiveParty(a.id,party)).toThrow();
    expect(repo.loadActiveParty(a.id)).toEqual(valid);expect(()=>repo.saveRoster(a.id,[other])).toThrow();expect(repo.loadRoster(b.id)).toEqual([other]);
  });
  it("enforces slot uniqueness, range and Guild/leader relationships even with direct SQL",()=>{
    const {db,repo}=fixture();const a=guild(repo),b=guild(repo,"Guild Beta");const x=character(),y=character(),z=character();
    repo.saveRoster(a.id,[x,y]);repo.saveRoster(b.id,[z]);repo.saveActiveParty(a.id,{memberIds:[x.id],leaderId:x.id});
    const insert=db.connection.prepare("INSERT INTO active_party_members VALUES (?,?,?)");
    expect(()=>insert.run(a.id,y.id,0)).toThrow();expect(()=>insert.run(a.id,y.id,4)).toThrow();expect(()=>insert.run(a.id,y.id,-1)).toThrow();
    expect(()=>insert.run(a.id,x.id,1)).toThrow();expect(()=>insert.run(a.id,z.id,1)).toThrow();expect(()=>insert.run(a.id,"missing",1)).toThrow();
    expect(()=>db.transaction(()=>db.connection.prepare("UPDATE active_parties SET leader_adventurer_id=? WHERE guild_id=?").run(y.id,a.id))).toThrow();
    expect(repo.loadActiveParty(a.id).leaderId).toBe(x.id);
    expect(()=>repo.createGuild({ownerPlayerId:"absent",name:"Invalid",level:1,gold:0})).toThrow();
    expect(()=>repo.savePendingRecruit("absent",character())).toThrow();
  });
  it("removes a roster member and clears their party/leader references atomically",()=>{
    const {repo}=fixture();const g=guild(repo);const x=character(),y=character();repo.saveRoster(g.id,[x,y]);
    repo.saveActiveParty(g.id,{memberIds:[x.id,y.id],leaderId:x.id});repo.saveRoster(g.id,[y,x]);expect(repo.loadActiveParty(g.id).leaderId).toBe(x.id);
    repo.saveRoster(g.id,[y]);expect(repo.loadActiveParty(g.id)).toEqual({memberIds:[y.id],leaderId:null});
  });
  it("rolls back all tables when an outer operation fails, including nested repository calls",()=>{
    const {repo}=fixture();const g=guild(repo);const x=character();repo.savePendingRecruit(g.id,x);
    expect(()=>repo.transaction(r=>{r.updateGuild(g.id,{gold:1});r.clearPendingRecruit(g.id);r.saveRoster(g.id,[x]);r.saveActiveParty(g.id,{memberIds:[x.id],leaderId:x.id});throw Error("abort");})).toThrow("abort");
    expect(repo.findGuild(g.id)).toEqual(g);expect(repo.loadRoster(g.id)).toEqual([]);expect(repo.loadPendingRecruit(g.id)).toEqual(x);expect(repo.loadActiveParty(g.id)).toEqual({memberIds:[],leaderId:null});
    repo.transaction(r=>{r.clearPendingRecruit(g.id);r.saveRoster(g.id,[x]);r.saveActiveParty(g.id,{memberIds:[x.id],leaderId:x.id});});
    expect(repo.loadPendingRecruit(g.id)).toBeNull();expect(repo.loadRoster(g.id)).toEqual([x]);
  });
  it("rejects async transaction callbacks before running them",()=>{
    const {db,repo}=fixture();const work=vi.fn();
    expect(()=>db.transaction(async()=>{work();})).toThrow(/synchronous/);
    expect(()=>repo.transaction(async()=>{work();})).toThrow(/synchronous/);
    expect(work).not.toHaveBeenCalled();
  });
  it("rolls back a mid-write storage error and remains usable",()=>{
    const {db,repo}=fixture();const g=guild(repo);const x=character(),y=character();repo.saveRoster(g.id,[x]);
    repo.saveActiveParty(g.id,{memberIds:[x.id],leaderId:x.id});
    db.connection.exec("CREATE TRIGGER simulate_failure BEFORE INSERT ON adventurers BEGIN SELECT RAISE(ABORT,'simulated write failure'); END;");
    expect(()=>repo.saveRoster(g.id,[y])).toThrow(/simulated/);expect(repo.loadRoster(g.id)).toEqual([x]);expect(repo.loadActiveParty(g.id).leaderId).toBe(x.id);
    db.connection.exec("DROP TRIGGER simulate_failure");repo.saveRoster(g.id,[y]);expect(repo.loadRoster(g.id)).toEqual([y]);
  });
});
