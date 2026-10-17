import { describe, expect, it, vi } from "vitest";
import { createGuild, parseGuild } from "../src/guild.js";
import { generateAdventurer } from "../src/adventurer.js";
import { applyParty, isPartyReady, type PartyAction } from "../src/party.js";
import { applyRecruitment } from "../src/recruitment.js";
vi.mock("@guild-to-glory/shared", async()=>import("../src/index.js"));
import { createGuildRepository } from "../../client/src/guildStorage.js";
function fixture() {
  const guild=createGuild("Party Guild");
  guild.roster=Array.from({length:6},(_,i)=>({...generateAdventurer(),id:String(i)}));
  return guild;
}
function populated() {
  let guild=fixture();
  for(const id of ["0","1","2","3"]) guild=applyParty(guild,{type:"add",id});
  return applyParty(guild,{type:"setLeader",id:"0"});
}
describe("Active Party",()=>{
  it("starts empty, adds and removes by ID without mutating the input",()=>{
    const initial=fixture();const added=applyParty(initial,{type:"add",id:"0"});
    expect(initial.activeParty).toEqual({memberIds:[],leaderId:null});
    expect(added.activeParty).toEqual({memberIds:["0"],leaderId:null});
    expect(added.roster).toEqual(initial.roster);
    expect(applyParty(added,{type:"remove",id:"0"}).activeParty).toEqual(initial.activeParty);
  });
  it("accepts four members and rejects a fifth, duplicates and non-roster IDs",()=>{
    const guild=populated();expect(guild.activeParty.memberIds).toHaveLength(4);
    for(const id of ["4","0","missing"]) expect(()=>applyParty(guild,{type:"add",id})).toThrow();
    expect(()=>applyParty(fixture(),{type:"add",id:"missing"})).toThrow(/roster/);
    expect(()=>applyParty(guild,{type:"remove",id:"missing"})).toThrow();
  });
  it("requires a member as leader and derives readiness without requiring four members",()=>{
    let guild=fixture();expect(isPartyReady(guild)).toBe(false);
    guild=applyParty(guild,{type:"add",id:"0"});expect(isPartyReady(guild)).toBe(false);
    expect(()=>applyParty(guild,{type:"setLeader",id:"1"})).toThrow();
    expect(()=>applyParty(guild,{type:"setLeader",id:"missing"})).toThrow();
    guild=applyParty(guild,{type:"setLeader",id:"0"});expect(isPartyReady(guild)).toBe(true);
    guild=applyParty(guild,{type:"add",id:"1"});guild=applyParty(guild,{type:"setLeader",id:"1"});
    expect(guild.activeParty.leaderId).toBe("1");
    expect(applyParty(guild,{type:"remove",id:"0"}).activeParty.leaderId).toBe("1");
    guild=applyParty(guild,{type:"remove",id:"1"});expect(guild.activeParty.leaderId).toBeNull();expect(isPartyReady(guild)).toBe(false);
  });
  it("replaces at capacity in the same slot, clears a replaced leader and rejects invalid replacements",()=>{
    const guild=populated();
    const replaced=applyParty(guild,{type:"replace",id:"0",replacementId:"4"});
    expect(replaced.activeParty).toEqual({memberIds:["4","1","2","3"],leaderId:null});
    expect(applyParty(guild,{type:"replace",id:"1",replacementId:"4"}).activeParty.leaderId).toBe("0");
    for(const replacementId of ["0","1","missing"]) expect(()=>applyParty(guild,{type:"replace",id:"0",replacementId})).toThrow();
    expect(()=>applyParty(guild,{type:"replace",id:"missing",replacementId:"4"})).toThrow();
    expect(guild.activeParty.leaderId).toBe("0");
  });
  it("clears the party and allows clearing an empty party",()=>{
    const cleared=applyParty(populated(),{type:"clear"});
    expect(cleared.activeParty).toEqual({memberIds:[],leaderId:null});
    expect(applyParty(cleared,{type:"clear"})).toEqual(cleared);
  });
  it.each(["0","1","5"])("dismisses %s and updates references atomically",id=>{
    const guild=populated();const dismissed=applyRecruitment(guild,{type:"dismiss",id});
    expect(dismissed.roster.some(a=>a.id===id)).toBe(false);
    expect(dismissed.activeParty.memberIds).toEqual(guild.activeParty.memberIds.filter(member=>member!==id));
    expect(dismissed.activeParty.leaderId).toBe(id==="0"?null:"0");
    expect(dismissed.gold).toBe(guild.gold);expect(guild.roster).toHaveLength(6);
  });
});
describe("Party storage and migration",()=>{
  it("migrates genuine M5.2 data without losing gold, roster or pending recruit",()=>{
    const {activeParty,...current}=fixture();
    const legacy={...current,schemaVersion:2,gold:12345,pendingRecruit:{...generateAdventurer(),id:"pending"}};
    let raw=JSON.stringify(legacy);const setItem=vi.fn((_key:string,value:string)=>{raw=value;});
    const repo=createGuildRepository(()=>({getItem:()=>raw,setItem}));
    expect(repo.load()).toEqual({status:"ready",guild:{...legacy,schemaVersion:3,activeParty:{memberIds:[],leaderId:null}}});
    expect(setItem).not.toHaveBeenCalled();
    expect(repo.update(g=>applyParty(g,{type:"add",id:"0"})).status).toBe("ready");
    expect(JSON.parse(raw)).toMatchObject({...legacy,schemaVersion:3,activeParty:{memberIds:["0"],leaderId:null}});
  });
  it("persists ready and not-ready parties across repository instances using IDs only",()=>{
    let raw=JSON.stringify(populated());const store={getItem:()=>raw,setItem:(_key:string,value:string)=>{raw=value;}};
    const repo=createGuildRepository(()=>store);
    expect(repo.load()).toEqual({status:"ready",guild:JSON.parse(raw)});
    const saved=repo.update(g=>applyParty(g,{type:"remove",id:"0"}));
    expect(saved.status).toBe("ready");
    expect(createGuildRepository(()=>store).load()).toEqual(saved);
    expect(JSON.parse(raw).activeParty).toEqual({memberIds:["1","2","3"],leaderId:null});
    repo.update(g=>applyParty(g,{type:"setLeader",id:"1"}));
    expect(createGuildRepository(()=>store).load()).toEqual({status:"ready",guild:JSON.parse(raw)});
  });
  it.each([null,{}, {memberIds:["missing"],leaderId:null},{memberIds:["0","0"],leaderId:null},
    {memberIds:["0","1","2","3","4"],leaderId:null},{memberIds:["0"],leaderId:"1"},
    {memberIds:[{}],leaderId:null},{memberIds:[],leaderId:"0"}])("preserves invalid saved party %j",activeParty=>{
    const guild={...fixture(),activeParty};const raw=JSON.stringify(guild);const setItem=vi.fn();
    expect(()=>parseGuild(guild)).toThrow();expect(isPartyReady(guild as any)).toBe(false);
    const repo=createGuildRepository(()=>({getItem:()=>raw,setItem}));
    expect(repo.load().status).toBe("error");expect(repo.update(g=>applyParty(g,{type:"clear"})).status).toBe("error");
    expect(setItem).not.toHaveBeenCalled();
  });
  const actions:PartyAction[]=[{type:"add",id:"4"},{type:"remove",id:"0"},{type:"setLeader",id:"1"},{type:"replace",id:"0",replacementId:"4"},{type:"clear"}];
  it.each(actions)("save failure preserves the complete snapshot for $type",action=>{
    const guild=applyParty(populated(),{type:"remove",id:"3"});const raw=JSON.stringify(guild);
    const setItem=vi.fn(()=>{throw Error("Quota exceeded");});const repo=createGuildRepository(()=>({getItem:()=>raw,setItem}));
    expect(repo.update(g=>applyParty(g,action)).status).toBe("error");expect(setItem).toHaveBeenCalledTimes(1);
    expect(repo.load()).toEqual({status:"ready",guild});
  });
  it("failed dismissal preserves both roster and leader; successful dismissal writes once",()=>{
    const guild=populated();let raw=JSON.stringify(guild);let fail=true;
    const setItem=vi.fn((_key:string,value:string)=>{if(fail)throw Error("Quota exceeded");raw=value;});
    const repo=createGuildRepository(()=>({getItem:()=>raw,setItem}));
    expect(repo.update(g=>applyRecruitment(g,{type:"dismiss",id:"0"})).status).toBe("error");
    expect(repo.load()).toEqual({status:"ready",guild});fail=false;setItem.mockClear();
    const saved=repo.update(g=>applyRecruitment(g,{type:"dismiss",id:"0"}));
    expect(saved.status).toBe("ready");expect(setItem).toHaveBeenCalledTimes(1);expect(repo.load()).toEqual(saved);
    expect(JSON.parse(raw).activeParty.leaderId).toBeNull();expect(JSON.parse(raw).roster).toHaveLength(5);
  });
});
