import { describe, it, expect, vi } from "vitest";
import { createGuild, parseGuild, validateGuildName } from "../src/guild.js";
import { generateAdventurer } from "../src/adventurer.js";
vi.mock("@guild-to-glory/shared",async()=>import("../src/index.js"));
import { createGuildRepository, GUILD_STORAGE_KEY } from "../../client/src/guildStorage.js";
function storage() {
  const values = new Map<string,string>();
  return { values, getItem: (key:string)=>values.get(key) ?? null, setItem: vi.fn((key:string,value:string)=>{values.set(key,value);}) };
}
describe("Guild foundation",()=>{
  it("creates a named level 1 guild with 40000 gold, empty roster, ID and timestamp",()=>{
    const guild=createGuild("  Dawn Guild  ");
    expect(guild).toMatchObject({schemaVersion:3,name:"Dawn Guild",level:1,gold:40000,roster:[]});
    expect(guild.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(Date.parse(guild.createdAt)).not.toBeNaN();
    expect(parseGuild(guild)).toEqual(guild);
  });
  it("creates distinct guild IDs",()=>expect(new Set(Array.from({length:100},()=>createGuild("Guild").id)).size).toBe(100));
  it.each(["", "   ", "ab", "a".repeat(25), "abc\nxyz"])("rejects invalid name %j",name=>expect(()=>validateGuildName(name)).toThrow());
  it.each(["abc", "a".repeat(24), "????????????", "??????"])("accepts valid name %j",name=>expect(validateGuildName(name)).toBe(name));
  it("round trips a full generated roster without changing the generator",()=>{
    const guild=createGuild("Roster");
    guild.roster=Array.from({length:8},()=>({...generateAdventurer(),id:crypto.randomUUID()}));
    const result=parseGuild(JSON.parse(JSON.stringify(guild)));
    expect(result).toEqual(guild);
    result.roster[0]!.baseStats.STR=0;
    expect(guild.roster[0]!.baseStats.STR).toBeGreaterThan(0);
    guild.roster.push({...generateAdventurer(),id:crypto.randomUUID()});
    expect(()=>parseGuild(guild)).toThrow();
  });
  it("rejects duplicate adventurer IDs and malformed stats, skills and traits",()=>{
    const guild=createGuild("Roster");
    const adventurer={...generateAdventurer(),id:crypto.randomUUID()};
    expect(()=>parseGuild({...guild,roster:[adventurer,adventurer]})).toThrow();
    for(const change of [{id:""},{baseStats:{}},{startingSkills:[{}]},{traits:[{}]},{level:0},{rarity:{}},{totalBaseStats:0}]) {
      expect(()=>parseGuild({...guild,roster:[{...adventurer,...change}]})).toThrow();
    }
  });
  it.each([{schemaVersion:99},{gold:-1},{gold:NaN},{level:0},{createdAt:"invalid"},{roster:null},{id:""}])("rejects invalid guild fields %j",change=>expect(()=>parseGuild({...createGuild("Guild"),...change})).toThrow());
});
describe("Guild storage adapter",()=>{
  it("saves once and reloads across repository instances without granting gold or replacing ID",()=>{
    const store=storage(); const repo=createGuildRepository(()=>store);
    expect(repo.load()).toEqual({status:"empty"});
    expect(store.setItem).not.toHaveBeenCalled();
    const created=repo.create("Dawn Guild");
    expect(created.status).toBe("ready");
    expect(createGuildRepository(()=>store).load()).toEqual(created);
    expect(createGuildRepository(()=>store).create("Duplicate Guild")).toEqual(created);
    expect(store.setItem).toHaveBeenCalledTimes(1);
  });
  it.each(["{broken", "null", "", JSON.stringify({schemaVersion:99}), JSON.stringify({...createGuild("Guild"),roster:[{}]})])("preserves invalid stored data %j",raw=>{
    const store=storage();store.values.set(GUILD_STORAGE_KEY,raw);
    const repo=createGuildRepository(()=>store);
    expect(repo.load().status).toBe("error");
    expect(repo.create("New Guild").status).toBe("error");
    expect(store.getItem(GUILD_STORAGE_KEY)).toBe(raw);
    expect(store.setItem).not.toHaveBeenCalled();
  });
  it("handles denied storage access without crashing",()=>{
    const repo=createGuildRepository(()=>{throw new Error("SecurityError");});
    expect(repo.load().status).toBe("error");
    expect(repo.create("Guild").status).toBe("error");
  });
  it("reports save failure and does not pretend a guild was persisted",()=>{
    const store=storage();store.setItem.mockImplementation(()=>{throw new Error("QuotaExceededError");});
    const repo=createGuildRepository(()=>store);
    expect(repo.create("Guild").status).toBe("error");
    expect(repo.load().status).toBe("empty");
  });
  it("does not write invalid names",()=>{
    const store=storage();
    expect(createGuildRepository(()=>store).create(" ").status).toBe("error");
    expect(store.setItem).not.toHaveBeenCalled();
  });
});
