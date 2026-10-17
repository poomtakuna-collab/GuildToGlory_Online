import { generateAdventurer } from "./adventurer.js";
import { parseGuild, GUILD_ROSTER_CAPACITY, type GuildData } from "./guild.js";
export const RECRUITMENT_COST = 10_000;
export type RecruitmentAction = {type:"roll"} | {type:"recruit";id:string} | {type:"reject";id:string} | {type:"dismiss";id:string};
/** Pure transition: callers must persist the returned snapshot before displaying success. */
export function applyRecruitment(current: GuildData, action: RecruitmentAction): GuildData {
  const guild=parseGuild(current);
  if(action.type === "roll") {
    if(guild.pendingRecruit) throw new Error("Decide on the pending recruit before rolling again.");
    if(guild.gold < RECRUITMENT_COST) throw new Error("Not enough gold. Rolling costs 10,000 G.");
    const recruit={...generateAdventurer(),id:crypto.randomUUID()};
    if(guild.roster.some(a=>a.id===recruit.id)) throw new Error("Adventurer ID collision. Please try again.");
    guild.pendingRecruit=recruit; guild.gold-=RECRUITMENT_COST;
  } else if(action.type === "dismiss") {
    if(!guild.roster.some(a=>a.id===action.id)) throw new Error("This adventurer is no longer in the roster.");
    guild.roster=guild.roster.filter(a=>a.id!==action.id);
    guild.activeParty.memberIds=guild.activeParty.memberIds.filter(id=>id!==action.id);
    if(guild.activeParty.leaderId===action.id) guild.activeParty.leaderId=null;
  } else {
    if(!guild.pendingRecruit || guild.pendingRecruit.id!==action.id) throw new Error("Pending recruit has changed. Review the current recruit.");
    if(action.type === "recruit") {
      if(guild.roster.length>=GUILD_ROSTER_CAPACITY) throw new Error("Roster full (8/8). Dismiss a member before recruiting.");
      guild.roster.push(guild.pendingRecruit);
    }
    guild.pendingRecruit=null;
  }
  return parseGuild(guild);
}
