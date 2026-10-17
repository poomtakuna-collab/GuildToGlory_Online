import {afterEach,describe,it,expect,vi} from "vitest";
import {createGuild,parseGuild} from "../src/guild.js";
import {applyRecruitment} from "../src/recruitment.js";
import {generateAdventurer} from "../src/adventurer.js";
vi.mock("@guild-to-glory/shared",async()=>import("../src/index.js"));
import {createGuildRepository} from "../../client/src/guildStorage.js";
import {addDeveloperGold} from "../../client/src/guildDebug.js";
const rolled=()=>applyRecruitment(createGuild("Test Guild"),{type:"roll"});
afterEach(()=>vi.unstubAllEnvs());
describe("Recruitment transitions",()=>{
  it("charges 10000 once and retains all generated data when recruiting",()=>{
    const initial=createGuild("Guild");const pending=applyRecruitment(initial,{type:"roll"});
    expect(initial.gold).toBe(40000);expect(initial.pendingRecruit).toBeNull();
    expect(pending.gold).toBe(30000);expect(pending.pendingRecruit).not.toBeNull();
    expect(()=>applyRecruitment(pending,{type:"roll"})).toThrow(/pending/);
    const recruited=applyRecruitment(pending,{type:"recruit",id:pending.pendingRecruit!.id});
    expect(recruited.roster).toEqual([pending.pendingRecruit]);expect(recruited.pendingRecruit).toBeNull();expect(recruited.gold).toBe(30000);
  });
  it("blocks insufficient gold",()=>expect(()=>applyRecruitment({...createGuild("Guild"),gold:9999},{type:"roll"})).toThrow(/Not enough/));
  it("rejects without refund and permits another distinct roll",()=>{
    const first=rolled();const rejected=applyRecruitment(first,{type:"reject",id:first.pendingRecruit!.id});
    expect(rejected.gold).toBe(30000);expect(rejected.pendingRecruit).toBeNull();
    const next=applyRecruitment(rejected,{type:"roll"});expect(next.gold).toBe(20000);expect(next.pendingRecruit!.id).not.toBe(first.pendingRecruit!.id);
  });
  it("blocks full roster, dismisses only selected member without refund, then recruits",()=>{
    const full=rolled();full.roster=Array.from({length:8},()=>({...generateAdventurer(),id:crypto.randomUUID()}));
    const action={type:"recruit" as const,id:full.pendingRecruit!.id};
    expect(()=>applyRecruitment(full,action)).toThrow(/Roster full/);
    const dismissed=applyRecruitment(full,{type:"dismiss",id:full.roster[3]!.id});
    expect(dismissed.roster).toEqual(full.roster.filter((_,i)=>i!==3));expect(dismissed.gold).toBe(full.gold);expect(dismissed.pendingRecruit).toEqual(full.pendingRecruit);
    expect(applyRecruitment(dismissed,action).roster).toHaveLength(8);
  });
  it("rejects duplicate IDs and stale decisions",()=>{
    const guild=rolled();expect(()=>parseGuild({...guild,roster:[guild.pendingRecruit]})).toThrow();
    expect(()=>applyRecruitment(guild,{type:"reject",id:"old-id"})).toThrow(/changed/);
    expect(()=>applyRecruitment(guild,{type:"dismiss",id:"missing"})).toThrow();
  });
});
describe("Persistence and migration",()=>{
  it("preserves legacy identity, timestamp, gold and roster, then persists schema 3 on successful action",()=>{
    const legacy:any={...createGuild("Existing"),schemaVersion:1,gold:12345,roster:[{...generateAdventurer(),id:crypto.randomUUID()}]};delete legacy.pendingRecruit;
    let raw=JSON.stringify(legacy);const set=vi.fn((_key:string,value:string)=>{raw=value;});const repo=createGuildRepository(()=>({getItem:()=>raw,setItem:set}));
    const loaded=repo.load();expect(loaded.status).toBe("ready");if(loaded.status!=="ready")throw Error();
    expect(loaded.guild).toEqual({...legacy,schemaVersion:3,pendingRecruit:null});expect(set).not.toHaveBeenCalled();
    expect(repo.update(g=>applyRecruitment(g,{type:"roll"})).status).toBe("ready");
    expect(JSON.parse(raw)).toMatchObject({id:legacy.id,createdAt:legacy.createdAt,gold:2345,schemaVersion:3,roster:legacy.roster});
    expect(createGuildRepository(()=>({getItem:()=>raw,setItem:set})).load()).toEqual(repo.load());
  });
  it.each(["roll","recruit","reject","dismiss"] as const)("save failure preserves the complete previous snapshot for %s",type=>{
    const guild=type==="roll"?createGuild("Guild"):rolled();guild.roster=[{...generateAdventurer(),id:crypto.randomUUID()}];
    const raw=JSON.stringify(guild);const store={getItem:()=>raw,setItem:()=>{throw Error("Quota exceeded");}};
    const repo=createGuildRepository(()=>store);
    const action=type==="roll"?{type}:{type,id:type==="dismiss"?guild.roster[0]!.id:guild.pendingRecruit!.id};
    expect(repo.update(g=>applyRecruitment(g,action)).status).toBe("error");expect(repo.load()).toEqual({status:"ready",guild});
  });
  it("rejects invalid pending data without replacing saved data",()=>{
    const raw=JSON.stringify({...createGuild("Guild"),pendingRecruit:{id:"bad"}});const set=vi.fn();const repo=createGuildRepository(()=>({getItem:()=>raw,setItem:set}));
    expect(repo.update(g=>applyRecruitment(g,{type:"roll"})).status).toBe("error");expect(set).not.toHaveBeenCalled();
  });
});
describe("Developer gold",()=>{
  it("adds and persists 100000 in development and checks overflow",()=>{
    vi.stubEnv("DEV",true);let raw=JSON.stringify(createGuild("Guild"));const repo=createGuildRepository(()=>({getItem:()=>raw,setItem:(_key,value)=>{raw=value;}}));
    expect(repo.update(addDeveloperGold).status).toBe("ready");expect(JSON.parse(raw).gold).toBe(140000);
    expect(()=>addDeveloperGold({...createGuild("Guild"),gold:Number.MAX_SAFE_INTEGER})).toThrow();
  });
  it("refuses debug gold in production",()=>{vi.stubEnv("DEV",false);expect(()=>addDeveloperGold(createGuild("Guild"))).toThrow(/production/);});
});
