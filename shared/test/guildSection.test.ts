import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@guild-to-glory/shared",async()=>import("../src/index.js"));
import { createGuild } from "../src/guild.js";
import { generateAdventurer } from "../src/adventurer.js";
import { setupGuildSection } from "../../client/src/guildSection.js";
import { GUILD_STORAGE_KEY } from "../../client/src/guildStorage.js";
function harness(raw?: string) {
  const nodes=new Map<string,any>();
  const element=()=>({style:{},hidden:false,disabled:false,textContent:"",value:"",children:[] as unknown[],handlers:{} as Record<string,Function>,
    addEventListener(name:string,fn:Function){this.handlers[name]=fn;},append(...children:unknown[]){this.children.push(...children);},replaceChildren(...children:unknown[]){this.children=children;},
    querySelector(selector:string){return get(selector);}});
  const get=(selector:string):any=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);};
  let saved=raw ?? null;
  const setItem=vi.fn((_key:string,value:string)=>{saved=value;});
  const events:Record<string,Function>={};
  vi.stubGlobal("window",{localStorage:{getItem:()=>saved,setItem},addEventListener:(name:string,fn:Function)=>{events[name]=fn;}});
  vi.stubGlobal("document",{createElement:()=>element()});
  vi.stubGlobal("navigator",{locks:{request:vi.fn(async (_key:string,fn:Function)=>fn())}});
  const root={querySelector:get} as unknown as HTMLElement;
  return {root,get,setItem,events,saved:()=>saved,submit:async(name:string)=>{get("input").value=name;await get("form").handlers.submit({preventDefault(){}});}};
}
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("Guild section flow",()=>{
  it("creates and displays eight empty slots, then restores without writing on refresh",async()=>{
    const h=harness();const refresh=setupGuildSection(h.root);
    expect(h.get("form").hidden).toBe(false);
    await h.submit("Dawn Guild");
    expect(h.get("form").hidden).toBe(true);
    expect(h.get("[data-guild-name]").textContent).toBe("Dawn Guild");
    expect(h.get("[data-guild-gold]").textContent).toBe("40,000 G");
    expect(h.get("[data-guild-roster]").textContent).toBe("0/8");
    expect(h.get("[data-guild-slots]").children).toHaveLength(8);
    refresh();await h.submit("Duplicate");
    expect(h.setItem).toHaveBeenCalledTimes(1);
    const reopened=harness(h.saved()!);setupGuildSection(reopened.root);
    expect(reopened.get("[data-guild-name]").textContent).toBe("Dawn Guild");
    expect(reopened.setItem).not.toHaveBeenCalled();
  });
  it("shows corrupted storage without allowing creation or replacing it",()=>{
    const h=harness("bad data");setupGuildSection(h.root);
    expect(h.get("form").hidden).toBe(true);
    expect(h.get("[data-guild-details]").hidden).toBe(true);
    expect(h.get("[data-guild-status]").textContent).toContain("not been reset");
    expect(h.setItem).not.toHaveBeenCalled();
  });
  it("keeps name validation errors retryable",async()=>{
    const h=harness();setupGuildSection(h.root);await h.submit("ab");
    expect(h.get("form").hidden).toBe(false);
    expect(h.get("[data-guild-status]").textContent).toContain("3?24");
    expect(h.get("button").disabled).toBe(false);
    await h.submit("Valid Guild");expect(h.setItem).toHaveBeenCalledTimes(1);
  });
  it("handles storage events and renders names as text",async()=>{
    const h=harness();setupGuildSection(h.root);await h.submit("<b>Guild</b>");
    h.events.storage!({key:GUILD_STORAGE_KEY});
    expect(h.get("[data-guild-name]").textContent).toBe("<b>Guild</b>");
    expect(h.get("[data-guild-name]").innerHTML).toBeUndefined();
  });
});

describe("Recruitment UI",()=>{
  it("reviews the saved pending recruit and confirms dismissal by name",async()=>{
    const h=harness();setupGuildSection(h.root);await h.submit("Dawn Guild");
    h.get("[data-roll]").handlers.click();
    await vi.waitFor(()=>expect(JSON.parse(h.saved()!).pendingRecruit).not.toBeNull());
    const candidate=JSON.parse(h.saved()!).pendingRecruit;
    const recruitButton=h.get("[data-pending]").children.find((n:any)=>n.textContent==="Recruit");
    recruitButton.handlers.click();await vi.waitFor(()=>expect(JSON.parse(h.saved()!).roster).toHaveLength(1));
    h.get("[data-guild-slots]").children[0].children[0].handlers.click();
    const dismiss=h.get("[data-member]").children.find((n:any)=>n.textContent==="Dismiss Adventurer");
    window.confirm=vi.fn(()=>false);dismiss.handlers.click();expect(JSON.parse(h.saved()!).roster).toHaveLength(1);
    window.confirm=vi.fn(()=>true);dismiss.handlers.click();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining(candidate.name));
    await vi.waitFor(()=>expect(JSON.parse(h.saved()!).roster).toHaveLength(0));
    expect(JSON.parse(h.saved()!).gold).toBe(30000);
  });
  it("does not mount the debug panel in production",()=>{
    vi.stubEnv("DEV",false);const h=harness();setupGuildSection(h.root);
    expect(h.get("[data-guild-details]").children).toHaveLength(0);
  });
});

describe("Party UI",()=>{
  const fixture=()=>{
    const guild=createGuild("Party Guild");
    guild.roster=Array.from({length:5},(_,i)=>({...generateAdventurer(),id:String(i),name:"Member "+i}));
    return guild;
  };
  const click=(node:any,label:string)=>{
    const button=node.children.find((n:any)=>n.textContent===label);
    expect(button).toBeDefined();expect(button.disabled).toBe(false);button.handlers.click();
  };
  it("adds four members, assigns and changes leader, replaces, removes, clears and restores",async()=>{
    const h=harness(JSON.stringify(fixture()));const refresh=setupGuildSection(h.root);
    const party=()=>JSON.parse(h.saved()!).activeParty;
    const slot=(i:number)=>h.get("[data-party-slots]").children[i];
    expect(h.get("[data-party-count]").textContent).toBe("0/4");
    expect(h.get("[data-party-slots]").children).toHaveLength(4);
    for(let i=0;i<4;i++){
      click(h.get("[data-guild-slots]").children[i],"Add to Party");
      await vi.waitFor(()=>expect(party().memberIds).toHaveLength(i+1));
    }
    expect(h.get("[data-guild-slots]").children[4].children[1].disabled).toBe(true);
    expect(h.get("[data-party-status]").textContent).toContain("Not Ready");
    click(slot(0),"Set Leader");await vi.waitFor(()=>expect(party().leaderId).toBe("0"));
    expect(h.get("[data-party-status]").textContent).toBe("Party Ready");
    expect(slot(0).children[0].textContent).toBe("Leader");
    click(slot(1),"Set Leader");await vi.waitFor(()=>expect(party().leaderId).toBe("1"));
    click(h.get("[data-guild-slots]").children[4],"Member 4");
    expect(h.get("[data-member]").children[2].textContent).toContain("STR:");
    expect(h.get("[data-member]").children[3].textContent).toContain("Starting Skills:");
    click(slot(1),"Replace with Member 4");await vi.waitFor(()=>expect(party().memberIds).toEqual(["0","4","2","3"]));
    expect(party().leaderId).toBeNull();
    click(slot(0),"Set Leader");await vi.waitFor(()=>expect(party().leaderId).toBe("0"));
    click(slot(0),"Remove");await vi.waitFor(()=>expect(party().memberIds).toHaveLength(3));
    expect(party().leaderId).toBeNull();refresh();
    const reopened=harness(h.saved()!);setupGuildSection(reopened.root);
    expect(reopened.get("[data-party-count]").textContent).toBe("3/4");
    reopened.get("[data-party-clear]").handlers.click();
    await vi.waitFor(()=>expect(JSON.parse(reopened.saved()!).activeParty).toEqual({memberIds:[],leaderId:null}));
    expect(reopened.get("[data-party-clear]").disabled).toBe(true);
  });
  it("failed removal leaves the saved and displayed leader intact, then dismissal removes both references",async()=>{
    const guild=fixture();guild.activeParty={memberIds:["0"],leaderId:"0"};
    const h=harness(JSON.stringify(guild));setupGuildSection(h.root);
    h.setItem.mockImplementationOnce(()=>{throw Error("Quota exceeded");});
    click(h.get("[data-party-slots]").children[0],"Remove");
    await vi.waitFor(()=>expect(h.get("[data-guild-status]").textContent).toContain("Quota exceeded"));
    expect(JSON.parse(h.saved()!).activeParty).toEqual(guild.activeParty);
    expect(h.get("[data-party-status]").textContent).toBe("Party Ready");
    click(h.get("[data-party-slots]").children[0],"Member 0");
    window.confirm=vi.fn(()=>true);click(h.get("[data-member]"),"Dismiss Adventurer");
    await vi.waitFor(()=>expect(JSON.parse(h.saved()!).roster).toHaveLength(4));
    expect(h.get("[data-party-count]").textContent).toBe("0/4");
    expect(JSON.parse(h.saved()!).activeParty.leaderId).toBeNull();
  });
});
