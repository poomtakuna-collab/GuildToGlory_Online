import { randomUUID } from "node:crypto";
import { parseGuild, validateGuildName, type GuildData, type ActiveParty, type RosterAdventurer } from "@guild-to-glory/shared";
import { GuildDatabase } from "./database.js";

export interface PlayerRecord { id: string; created_at: string; updated_at: string }
export interface GuildRecord {
  id: string; owner_player_id: string; name: string; level: number; gold: number;
  created_at: string; updated_at: string;
}
export interface CreateGuildInput { id?: string; ownerPlayerId: string; name: string; level: number; gold: number; createdAt?: string }
function id(value: string): void { if(typeof value!=="string" || !value.trim()) throw Error("Invalid ID."); }
function number(value: number, min: number): void { if(!Number.isSafeInteger(value) || value<min) throw Error("Invalid level or gold."); }
/** Reuse current generated-character validation without generating characters or granting gold.
 * Validate characters individually: the future business layer owns the roster capacity rule.
 */
function adventurer(value: RosterAdventurer): RosterAdventurer {
  return parseGuild({schemaVersion:3,id:"validation",name:"Validation",level:1,gold:0,
    createdAt:"2000-01-01T00:00:00.000Z",roster:[value],pendingRecruit:null,
    activeParty:{memberIds:[],leaderId:null}}).roster[0]!;
}
export class GuildRepository {
  constructor(private readonly database: GuildDatabase) {}
  private get db() { return this.database.connection; }
  transaction<T>(work: (repository: GuildRepository)=>T): T {
    if(work.constructor.name==="AsyncFunction") throw Error("Database transactions require a synchronous callback.");
    return this.database.transaction(()=>work(this));
  }
  createPlayer(playerId=randomUUID()): PlayerRecord {
    id(playerId);const now=new Date().toISOString();
    this.db.prepare("INSERT INTO players(id,created_at,updated_at) VALUES (?,?,?)").run(playerId,now,now);
    return this.findPlayer(playerId)!;
  }
  findPlayer(playerId: string): PlayerRecord | null {
    return this.db.prepare("SELECT * FROM players WHERE id=?").get(playerId) as unknown as PlayerRecord ?? null;
  }
  createGuild(input: CreateGuildInput): GuildRecord {
    const guildId=input.id??randomUUID();id(guildId);id(input.ownerPlayerId);
    const name=validateGuildName(input.name);number(input.level,1);number(input.gold,0);
    return this.database.transaction(()=>{
      const now=input.createdAt??new Date().toISOString();
      this.db.prepare("INSERT INTO guilds(id,owner_player_id,name,level,gold,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
        .run(guildId,input.ownerPlayerId,name,input.level,input.gold,now,now);
      this.db.prepare("INSERT INTO active_parties(guild_id,leader_adventurer_id) VALUES (?,NULL)").run(guildId);
      return this.findGuild(guildId)!;
    });
  }
  findGuild(guildId: string): GuildRecord | null {
    return this.db.prepare("SELECT * FROM guilds WHERE id=?").get(guildId) as unknown as GuildRecord ?? null;
  }
  findGuildByPlayer(playerId: string): GuildRecord | null {
    return this.db.prepare("SELECT * FROM guilds WHERE owner_player_id=?").get(playerId) as unknown as GuildRecord ?? null;
  }
  private requireGuild(guildId: string): GuildRecord {
    const guild=this.findGuild(guildId);if(!guild)throw Error("Guild not found.");return guild;
  }
  updateGuild(guildId: string, change: {name?:string; level?:number; gold?:number}): GuildRecord {
    return this.database.transaction(()=>{
      const current=this.requireGuild(guildId);
      const name=validateGuildName(change.name??current.name),level=change.level??current.level,gold=change.gold??current.gold;
      number(level,1);number(gold,0);
      this.db.prepare("UPDATE guilds SET name=?,level=?,gold=?,updated_at=? WHERE id=?").run(name,level,gold,new Date().toISOString(),guildId);
      return this.findGuild(guildId)!;
    });
  }
  saveRoster(guildId: string, roster: readonly RosterAdventurer[]): void {
    const members=roster.map(adventurer);
    if(new Set(members.map(a=>a.id)).size!==members.length)throw Error("Duplicate adventurer IDs.");
    this.database.transaction(()=>{
      this.requireGuild(guildId);
      const pending=this.loadPendingRecruit(guildId);
      if(pending && members.some(a=>a.id===pending.id))throw Error("Clear pending recruit before adding it to roster in the same transaction.");
      for(const a of members) {
        const existing=this.db.prepare("SELECT guild_id FROM adventurers WHERE id=?").get(a.id);
        if(existing && existing.guild_id!==guildId)throw Error("Adventurer belongs to another Guild.");
      }
      // Delete only removed IDs: unchanged party references and creation times survive saves.
      for(const row of this.db.prepare("SELECT id FROM adventurers WHERE guild_id=?").all(guildId)) {
        if(!members.some(a=>a.id===row.id))this.db.prepare("DELETE FROM adventurers WHERE guild_id=? AND id=?").run(guildId,row.id as string);
      }
      const save=this.db.prepare(`INSERT INTO adventurers
        (id,guild_id,name,rarity,level,race,class_name,base_stats,total_base_stats,starting_skills,traits,roster_index,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,rarity=excluded.rarity,level=excluded.level,
        race=excluded.race,class_name=excluded.class_name,base_stats=excluded.base_stats,total_base_stats=excluded.total_base_stats,
        starting_skills=excluded.starting_skills,traits=excluded.traits,roster_index=excluded.roster_index`);
      members.forEach((a,index)=>save.run(a.id,guildId,a.name,JSON.stringify(a.rarity),a.level,a.race,a.className,
        JSON.stringify(a.baseStats),a.totalBaseStats,JSON.stringify(a.startingSkills),JSON.stringify(a.traits),index,new Date().toISOString()));
    });
  }
  loadRoster(guildId: string): RosterAdventurer[] {
    this.requireGuild(guildId);
    return this.db.prepare("SELECT * FROM adventurers WHERE guild_id=? ORDER BY roster_index,id").all(guildId).map(row=>adventurer({
      id:row.id,name:row.name,rarity:JSON.parse(row.rarity as string),level:row.level,race:row.race,className:row.class_name,
      baseStats:JSON.parse(row.base_stats as string),totalBaseStats:row.total_base_stats,
      startingSkills:JSON.parse(row.starting_skills as string),traits:JSON.parse(row.traits as string)
    } as RosterAdventurer));
  }
  savePendingRecruit(guildId: string, recruit: RosterAdventurer): void {
    const valid=adventurer(recruit);
    this.database.transaction(()=>{
      this.requireGuild(guildId);
      if(this.db.prepare("SELECT id FROM adventurers WHERE id=?").get(valid.id)) throw Error("Pending recruit is already in a roster.");
      this.db.prepare(`INSERT INTO pending_recruits(guild_id,adventurer_data,created_at) VALUES (?,?,?)
        ON CONFLICT(guild_id) DO UPDATE SET adventurer_data=excluded.adventurer_data,created_at=excluded.created_at`)
        .run(guildId,JSON.stringify(valid),new Date().toISOString());
    });
  }
  loadPendingRecruit(guildId: string): RosterAdventurer | null {
    this.requireGuild(guildId);
    const row=this.db.prepare("SELECT adventurer_data FROM pending_recruits WHERE guild_id=?").get(guildId);
    return row ? adventurer(JSON.parse(row.adventurer_data as string)) : null;
  }
  clearPendingRecruit(guildId: string): void {
    this.requireGuild(guildId);this.db.prepare("DELETE FROM pending_recruits WHERE guild_id=?").run(guildId);
  }
  saveActiveParty(guildId: string, party: ActiveParty): void {
    if(!party || !Array.isArray(party.memberIds) || party.memberIds.length>4 ||
      !Array.from(party.memberIds).every(member=>typeof member==="string" && member.trim()) ||
      new Set(party.memberIds).size!==party.memberIds.length ||
      (party.leaderId!==null && !party.memberIds.includes(party.leaderId)))throw Error("Invalid Party members or leader.");
    this.database.transaction(()=>{
      this.requireGuild(guildId);
      for(const member of party.memberIds)if(!this.db.prepare("SELECT id FROM adventurers WHERE guild_id=? AND id=?").get(guildId,member))throw Error("Party member must belong to this Guild.");
      this.db.prepare("UPDATE active_parties SET leader_adventurer_id=NULL WHERE guild_id=?").run(guildId);
      this.db.prepare("DELETE FROM active_party_members WHERE guild_id=?").run(guildId);
      party.memberIds.forEach((member,index)=>this.db.prepare("INSERT INTO active_party_members(guild_id,adventurer_id,slot_index) VALUES (?,?,?)").run(guildId,member,index));
      this.db.prepare("UPDATE active_parties SET leader_adventurer_id=? WHERE guild_id=?").run(party.leaderId,guildId);
    });
  }
  loadGuildForPlayer(playerId:string):GuildData|null {
    const row=this.findGuildByPlayer(playerId);if(!row)return null;
    return parseGuild({schemaVersion:3,id:row.id,name:row.name,level:row.level,gold:row.gold,createdAt:row.created_at,
      roster:this.loadRoster(row.id),pendingRecruit:this.loadPendingRecruit(row.id),activeParty:this.loadActiveParty(row.id)});
  }
  saveGuildSnapshot(playerId:string,value:GuildData):void {
    const guild=parseGuild(value);
    this.database.transaction(()=>{
      const existing=this.findGuildByPlayer(playerId);
      if(existing && existing.id!==guild.id)throw Error("Guild identity cannot change.");
      // Pending IDs also participate in cross-Guild uniqueness checks.
      const ids=[...guild.roster.map(a=>a.id),...(guild.pendingRecruit?[guild.pendingRecruit.id]:[])];
      for(const id of ids) {
        if(this.db.prepare("SELECT id FROM adventurers WHERE id=? AND guild_id<>?").get(id,guild.id) ||
          this.db.prepare("SELECT guild_id FROM pending_recruits WHERE json_extract(adventurer_data,'$.id')=? AND guild_id<>?").get(id,guild.id))throw Error("Adventurer ID already exists.");
      }
      if(!existing)this.createGuild({id:guild.id,ownerPlayerId:playerId,name:guild.name,level:guild.level,gold:guild.gold,createdAt:guild.createdAt});
      else this.updateGuild(guild.id,{name:guild.name,level:guild.level,gold:guild.gold});
      this.clearPendingRecruit(guild.id);this.saveRoster(guild.id,guild.roster);
      if(guild.pendingRecruit)this.savePendingRecruit(guild.id,guild.pendingRecruit);
      this.saveActiveParty(guild.id,guild.activeParty);
    });
  }
  revision(playerId:string):number { return (this.db.prepare("SELECT revision FROM guild_revisions WHERE player_id=?").get(playerId)?.revision as number|undefined)??0; }
  advanceRevision(playerId:string):void {
    this.db.prepare("INSERT INTO guild_revisions(player_id,revision) VALUES (?,1) ON CONFLICT(player_id) DO UPDATE SET revision=revision+1").run(playerId);
  }
  commandReceipt(playerId:string,requestId:string):{fingerprint:string;outcome:string}|null {
    return this.db.prepare("SELECT fingerprint,outcome FROM guild_commands WHERE player_id=? AND request_id=?").get(playerId,requestId) as {fingerprint:string;outcome:string}|undefined ?? null;
  }
  saveCommandReceipt(playerId:string,requestId:string,fingerprint:string,outcome:unknown):void {
    this.db.prepare("INSERT INTO guild_commands VALUES (?,?,?,?,?)").run(playerId,requestId,fingerprint,JSON.stringify(outcome),new Date().toISOString());
  }
  loadActiveParty(guildId: string): ActiveParty {
    this.requireGuild(guildId);
    const row=this.db.prepare("SELECT leader_adventurer_id FROM active_parties WHERE guild_id=?").get(guildId);
    if(!row)throw Error("Missing Active Party record.");
    return {memberIds:this.db.prepare("SELECT adventurer_id FROM active_party_members WHERE guild_id=? ORDER BY slot_index").all(guildId).map(row=>row.adventurer_id as string),
      leaderId:row.leader_adventurer_id as string|null};
  }
}
