import { addDeveloperGold } from "./guildDebug.js";
import { ADVENTURER_STAT_KEYS, applyParty, isPartyReady, PARTY_CAPACITY, type PartyAction, applyRecruitment, type RecruitmentAction, type RosterAdventurer, GUILD_ROSTER_CAPACITY } from "@guild-to-glory/shared";
import { createGuildRepository, GUILD_STORAGE_KEY, type GuildLoadResult } from "./guildStorage.js";

export function setupGuildSection(root: HTMLElement): () => void {
  const repository = createGuildRepository(() => window.localStorage);
  const form = root.querySelector<HTMLFormElement>("form")!;
  const input = root.querySelector<HTMLInputElement>("input")!;
  const submit = form.querySelector<HTMLButtonElement>("button")!;
  const status = root.querySelector<HTMLElement>("[data-guild-status]")!;
  const details = root.querySelector<HTMLElement>("[data-guild-details]")!;
  let pending = false;
  let selectedId: string | null = null;
  const roll=root.querySelector<HTMLButtonElement>("[data-roll]")!;
  function button(label:string, action:()=>void, disabled=false): HTMLButtonElement {
    const element=document.createElement("button");element.type="button";element.className="secondary-button";
    element.textContent=label;element.disabled=disabled;element.addEventListener("click",action);return element;
  }
  function character(target:HTMLElement, adventurer:RosterAdventurer): void {
    const title=document.createElement("h3");title.textContent=adventurer.name;
    const rarity=document.createElement("p");rarity.textContent=adventurer.rarity.name+" / Human / Level 1";rarity.style.color=adventurer.rarity.colorHex;
    const stats=document.createElement("p");stats.textContent=ADVENTURER_STAT_KEYS.map(key=>key+": "+adventurer.baseStats[key]).join(" | ");
    const skills=document.createElement("p");skills.textContent="Starting Skills: "+adventurer.startingSkills.map(s=>s.name).join(", ");
    const traits=document.createElement("ul");
    for(const trait of adventurer.traits){const li=document.createElement("li");li.textContent=trait.name+" ("+trait.type+"): "+trait.effects.map(e=>e.description+" ["+e.target+" "+(e.value>0?"+":"")+e.value+"%]").join("; ");traits.append(li);}
    if(!adventurer.traits.length){const li=document.createElement("li");li.textContent="Traits: None";traits.append(li);}
    target.replaceChildren(title,rarity,stats,skills,traits);
  }
  async function run(change:()=>GuildLoadResult): Promise<void> {
    if(pending)return;
    pending=true;submit.disabled=true;roll.disabled=true;
    try {
      const result=navigator.locks ? await navigator.locks.request(GUILD_STORAGE_KEY,change) : change();
      if(result.status==="error") { render(repository.load());status.textContent=result.message; }
      else render(result);
    } catch { render(repository.load());status.textContent="Unable to save Guild. Please try again."; }
    finally { pending=false;submit.disabled=false; }
  }
  const act=(action:RecruitmentAction)=>void run(()=>repository.update(guild=>applyRecruitment(guild,action)));
  const partyAct=(action:PartyAction)=>void run(()=>repository.update(guild=>applyParty(guild,action)));
  root.querySelector<HTMLButtonElement>("[data-party-clear]")!.addEventListener("click",()=>partyAct({type:"clear"}));
  roll.addEventListener("click",()=>act({type:"roll"}));
  if(import.meta.env.DEV){
    const panel=document.createElement("section");panel.className="guild-debug";
    const label=document.createElement("h3");label.textContent="Developer Debug (local testing only)";
    panel.append(label,button("+100,000 G",()=>void run(()=>repository.update(addDeveloperGold))));details.append(panel);
  }
  function render(result: GuildLoadResult): void {
    form.hidden = result.status !== "empty";
    details.hidden = result.status !== "ready";
    status.textContent = result.status === "error" ? result.message : "";
    if (result.status !== "ready") return;
    const guild = result.guild;
    root.querySelector<HTMLElement>("[data-guild-name]")!.textContent = guild.name;
    root.querySelector<HTMLElement>("[data-guild-level]")!.textContent = String(guild.level);
    root.querySelector<HTMLElement>("[data-guild-gold]")!.textContent = guild.gold.toLocaleString("en-US") + " G";
    root.querySelector<HTMLElement>("[data-guild-roster]")!.textContent = guild.roster.length + "/" + GUILD_ROSTER_CAPACITY;
    const slots = root.querySelector<HTMLElement>("[data-guild-slots]")!;
    slots.replaceChildren(...Array.from({length:GUILD_ROSTER_CAPACITY},(_,i)=>{
      const slot = document.createElement("li");
      const member=guild.roster[i];
      if(member){
        const included=guild.activeParty.memberIds.includes(member.id);
        slot.append(button(member.name,()=>{selectedId=member.id;refresh();}),
          button(included ? "In Party" : "Add to Party",()=>partyAct({type:"add",id:member.id}),included || guild.activeParty.memberIds.length>=PARTY_CAPACITY));
      }
      else slot.textContent="Empty Slot "+(i+1);
      return slot;
    }));
    const party=guild.activeParty;
    const replacement=guild.roster.find(a=>a.id===selectedId && !party.memberIds.includes(a.id));
    root.querySelector<HTMLElement>("[data-party-count]")!.textContent=party.memberIds.length+"/"+PARTY_CAPACITY;
    root.querySelector<HTMLElement>("[data-party-status]")!.textContent=isPartyReady(guild) ? "Party Ready" : "Party Not Ready ? choose a member and assign a leader.";
    root.querySelector<HTMLButtonElement>("[data-party-clear]")!.disabled=party.memberIds.length===0;
    root.querySelector<HTMLElement>("[data-party-slots]")!.replaceChildren(...Array.from({length:PARTY_CAPACITY},(_,i)=>{
      const slot=document.createElement("li");
      const adventurer=guild.roster.find(a=>a.id===party.memberIds[i]);
      if(!adventurer){slot.textContent="Empty Slot "+(i+1);return slot;}
      const leader=party.leaderId===adventurer.id;
      const label=document.createElement("span");label.textContent=leader ? "Leader" : "Member";
      slot.append(label,button(adventurer.name,()=>{selectedId=adventurer.id;refresh();}),
        button("Set Leader",()=>partyAct({type:"setLeader",id:adventurer.id}),leader),
        button("Remove",()=>partyAct({type:"remove",id:adventurer.id})));
      if(replacement)slot.append(button("Replace with "+replacement.name,()=>partyAct({type:"replace",id:adventurer.id,replacementId:replacement.id})));
      return slot;
    }));
    roll.hidden=!!guild.pendingRecruit;
    roll.disabled=!!guild.pendingRecruit || guild.gold<10_000;
    root.querySelector<HTMLElement>("[data-roll-help]")!.textContent=guild.pendingRecruit ? "Recruit or reject the pending adventurer before rolling again." : guild.gold<10_000 ? "Not enough gold. Rolling costs 10,000 G." : "Each roll costs 10,000 G. Rejecting does not refund gold.";
    const candidate=root.querySelector<HTMLElement>("[data-pending]")!;
    candidate.hidden=!guild.pendingRecruit;
    if(guild.pendingRecruit){
      const recruit=guild.pendingRecruit;character(candidate,recruit);
      candidate.append(button("Recruit",()=>act({type:"recruit",id:recruit.id}),guild.roster.length>=GUILD_ROSTER_CAPACITY),button("Reject",()=>act({type:"reject",id:recruit.id})));
      if(guild.roster.length>=GUILD_ROSTER_CAPACITY){const hint=document.createElement("p");hint.textContent="Roster full (8/8). Dismiss a member to recruit this adventurer.";candidate.append(hint);}
    }
    const member=root.querySelector<HTMLElement>("[data-member]")!;
    const selected=guild.roster.find(a=>a.id===selectedId);member.hidden=!selected;
    if(selected){character(member,selected);member.append(button("Dismiss Adventurer",()=>{
      if(window.confirm('Dismiss "'+selected.name+'" permanently? No gold will be refunded.'))act({type:"dismiss",id:selected.id});
    }));}
  }
  const refresh = () => render(repository.load());
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (pending) return;
    pending = true; submit.disabled = true;
    try {
      // Serialize creation between tabs on browsers that support Web Locks.
      const result = navigator.locks
        ? await navigator.locks.request(GUILD_STORAGE_KEY, () => repository.create(input.value))
        : repository.create(input.value);
      if (result.status === "error" && repository.load().status === "empty") status.textContent = result.message;
      else render(result);
    } catch { status.textContent = "Unable to create Guild. Please try again."; }
    finally { pending = false; submit.disabled = false; }
  });
  window.addEventListener("storage", event => { if (event.key === GUILD_STORAGE_KEY || event.key === null) refresh(); });
  refresh();
  return refresh;
}
