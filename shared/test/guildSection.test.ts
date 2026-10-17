import {afterEach,expect,it,vi} from "vitest";
vi.mock("@guild-to-glory/shared",async()=>import("../src/index.js"));
import {setupGuildSection} from "../../client/src/guildSection.js";
import {GuildDatabase} from "../../server/src/database/database.js";
import {GuildRepository} from "../../server/src/database/repository.js";
import {GuildService} from "../../server/src/guild/service.js";
import {createGuild,type GuildData} from "../src/guild.js";
import {generateAdventurer} from "../src/adventurer.js";
const dbs:GuildDatabase[]=[];
function harness(initial?:GuildData,mode="development"){
 const db=new GuildDatabase(":memory:");dbs.push(db);const repo=new GuildRepository(db);const player=repo.createPlayer();
 if(initial)repo.saveGuildSnapshot(player.id,initial);
 const service=new GuildService(repo,mode,true);let revision=0;
 const api={load:vi.fn(async()=>{const r=service.get(player.id);revision=r.revision;return r;}),
 command:vi.fn(async(action:any)=>{const r=service.execute(player.id,{requestId:crypto.randomUUID(),expectedRevision:revision,action});revision=r.revision;return r;}),
 retry:vi.fn(async()=>api.load()),hasPending:()=>false};
 const nodes=new Map<string,any>(),all:any[]=[],events:Record<string,Function>={};
 function element():any {const node={hidden:false,disabled:false,style:{},value:"",textContent:"",children:[] as any[],handlers:{} as Record<string,Function>,
  append(...children:any[]){this.children.push(...children);},replaceChildren(...children:any[]){this.children=children;},addEventListener(name:string,fn:Function){this.handlers[name]=fn;},querySelector:get};all.push(node);return node;}
 function get(key:string):any{if(!nodes.has(key))nodes.set(key,element());return nodes.get(key);}
 const legacy=createGuild("Legacy Guild"),raw=JSON.stringify(legacy);const setItem=vi.fn();
 vi.stubGlobal("window",{localStorage:{getItem:()=>raw,setItem},confirm:vi.fn(()=>true),addEventListener:(name:string,fn:Function)=>{events[name]=fn;}});
 vi.stubGlobal("document",{createElement:element});
 const root={hidden:false,querySelector:get,querySelectorAll:()=>all} as any;
 const refresh=setupGuildSection(root,api);return {api,get,refresh,events,legacy,setItem,repo,player,
 state:()=>service.get(player.id).guild,
 click:(target:any,label:string)=>{const b=target.children.find((n:any)=>n.textContent===label);expect(b).toBeDefined();expect(b.disabled).toBe(false);b.handlers.click();},
 submit:async(name:string)=>{get("input").value=name;await get("form").handlers.submit({preventDefault(){}});}};
}
afterEach(()=>{for(const db of dbs.splice(0))db.close();vi.unstubAllGlobals();});
it("loads from Server, creates once, validates name and renders eight slots safely",async()=>{
 const h=harness();expect(h.api.load).not.toHaveBeenCalled();h.refresh();await vi.waitFor(()=>expect(h.get("form").hidden).toBe(false));
 await h.submit("ab");expect(h.get("[data-guild-status]").textContent).toContain("3?24");
 await h.submit("<b>Guild</b>");expect(h.get("[data-guild-name]").textContent).toBe("<b>Guild</b>");expect(h.get("[data-guild-name]").innerHTML).toBeUndefined();
 expect(h.get("[data-guild-slots]").children).toHaveLength(8);expect(h.get("[data-guild-gold]").textContent).toBe("40,000 G");expect(h.setItem).not.toHaveBeenCalled();
 h.events.focus!();await vi.waitFor(()=>expect(h.api.load).toHaveBeenCalledTimes(2));
});
it("rolls, recruits, assigns leader and dismisses only after server confirmation",async()=>{
 const h=harness(createGuild("Guild"));h.refresh();await vi.waitFor(()=>expect(h.get("[data-guild-name]").textContent).toBe("Guild"));
 h.get("[data-roll]").handlers.click();h.get("[data-roll]").handlers.click();await vi.waitFor(()=>expect(h.state()?.pendingRecruit).not.toBeNull());
 expect(h.api.command).toHaveBeenCalledTimes(1);expect(h.state()?.gold).toBe(30000);
 h.click(h.get("[data-pending]"),"Recruit");await vi.waitFor(()=>expect(h.state()?.roster).toHaveLength(1));
 h.click(h.get("[data-guild-slots]").children[0],"Add to Party");await vi.waitFor(()=>expect(h.state()?.activeParty.memberIds).toHaveLength(1));
 h.click(h.get("[data-party-slots]").children[0],"Set Leader");await vi.waitFor(()=>expect(h.get("[data-party-status]").textContent).toBe("Party Ready"));
 h.click(h.get("[data-party-slots]").children[0],h.state()!.roster[0]!.name);expect(h.get("[data-member]").children[2].textContent).toContain("STR:");
 window.confirm=vi.fn(()=>false);h.click(h.get("[data-member]"),"Dismiss Adventurer");expect(h.state()?.roster).toHaveLength(1);
 window.confirm=vi.fn(()=>true);h.click(h.get("[data-member]"),"Dismiss Adventurer");await vi.waitFor(()=>expect(h.state()?.roster).toHaveLength(0));
 expect(h.state()?.activeParty.leaderId).toBeNull();expect(h.setItem).not.toHaveBeenCalled();
});
it("supports four slots, replacement, leader removal and clear",async()=>{
 const g=createGuild("Guild");g.roster=Array.from({length:5},(_,i)=>({...generateAdventurer(),id:String(i)}));g.activeParty={memberIds:["0","1","2","3"],leaderId:"0"};
 const h=harness(g);h.refresh();await vi.waitFor(()=>expect(h.get("[data-party-count]").textContent).toBe("4/4"));
 expect(h.get("[data-guild-slots]").children[4].children[1].disabled).toBe(true);
 h.click(h.get("[data-guild-slots]").children[4],g.roster[4]!.name);h.click(h.get("[data-party-slots]").children[0],"Replace with "+g.roster[4]!.name);
 await vi.waitFor(()=>expect(h.state()?.activeParty.memberIds[0]).toBe("4"));expect(h.state()?.activeParty.leaderId).toBeNull();
 h.click(h.get("[data-party-slots]").children[0],"Remove");await vi.waitFor(()=>expect(h.state()?.activeParty.memberIds).toHaveLength(3));
 h.get("[data-party-clear]").handlers.click();await vi.waitFor(()=>expect(h.state()?.activeParty.memberIds).toHaveLength(0));
});
it("shows network errors with retry and preserves last confirmed data",async()=>{
 const h=harness(createGuild("Guild"));h.api.load.mockRejectedValueOnce(Error("Server offline"));h.refresh();await vi.waitFor(()=>expect(h.get("[data-guild-status]").textContent).toBe("Server offline"));
 h.get("[data-guild-retry]").handlers.click();await vi.waitFor(()=>expect(h.get("[data-guild-name]").textContent).toBe("Guild"));
 h.api.command.mockRejectedValueOnce(Error("Network lost; retry"));h.get("[data-roll]").handlers.click();await vi.waitFor(()=>expect(h.get("[data-guild-status]").textContent).toContain("Network lost"));
 expect(h.state()?.gold).toBe(40000);expect(h.get("[data-guild-gold]").textContent).toBe("40,000 G");
});
it("previews and confirms legacy import without deleting original storage",async()=>{
 const h=harness();h.refresh();await vi.waitFor(()=>expect(h.get("[data-legacy-import]").hidden).toBe(false));
 expect(h.state()).toBeNull();h.get("[data-legacy-preview]").handlers.click();expect(h.get("[data-legacy-data]").textContent).toContain("Legacy Guild");
 window.confirm=vi.fn(()=>false);h.get("[data-legacy-confirm]").handlers.click();expect(h.api.command).not.toHaveBeenCalled();
 window.confirm=vi.fn(()=>true);h.get("[data-legacy-confirm]").handlers.click();await vi.waitFor(()=>expect(h.state()).toEqual(h.legacy));expect(h.setItem).not.toHaveBeenCalled();
});
it("uses server feature flags to hide debug and import on production",async()=>{
 const h=harness(undefined,"production");h.refresh();await vi.waitFor(()=>expect(h.get("form").hidden).toBe(false));
 expect(h.get("[data-server-debug]").hidden).toBe(true);expect(h.get("[data-legacy-import]").hidden).toBe(true);
});
