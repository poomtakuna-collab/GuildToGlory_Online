import { type GeneratedAdventurer, RARITY_CONFIG, ADVENTURER_STAT_KEYS } from "./adventurer.js";
import { SKILL_POOLS } from "./skills.js";
import { TRAIT_REGISTRY } from "./traitRegistry.js";

export const GUILD_SCHEMA_VERSION = 3;
export const GUILD_ROSTER_CAPACITY = 8;
export const GUILD_STARTING_GOLD = 40_000;
export interface RosterAdventurer extends GeneratedAdventurer { id: string }
export const PARTY_CAPACITY = 4;
export interface ActiveParty { memberIds: string[]; leaderId: string | null }
export interface GuildData {
  schemaVersion: 3;
  activeParty: ActiveParty;
  pendingRecruit: RosterAdventurer | null;
  id: string;
  name: string;
  level: number;
  gold: number;
  roster: RosterAdventurer[];
  createdAt: string;
}
export function validateGuildName(value: string): string {
  const name = value.trim();
  if ([...name].length < 3 || [...name].length > 24 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error("Guild name must contain 3?24 characters without control characters.");
  }
  return name;
}
export function createGuild(name: string): GuildData {
  return { schemaVersion: GUILD_SCHEMA_VERSION, id: crypto.randomUUID(), name: validateGuildName(name),
    level: 1, gold: GUILD_STARTING_GOLD, roster: [], activeParty: { memberIds: [], leaderId: null }, pendingRecruit: null, createdAt: new Date().toISOString() };
}
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const integer = (v: unknown, min: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min;
// Compare definitions by fields, independent of JSON object key order.
function matches(value: unknown, definition: unknown): boolean {
  if (Array.isArray(definition)) return Array.isArray(value) && value.length === definition.length && definition.every((v,i)=>matches(value[i],v));
  if (record(definition)) return record(value) && Object.keys(definition).every(key=>matches(value[key],definition[key]));
  return value === definition;
}
function validAdventurer(value: unknown): value is RosterAdventurer {
  if (!record(value) || !text(value.id) || !text(value.name) || value.level !== 1 || value.race !== "Human" || value.className !== null ||
      !RARITY_CONFIG.some(r=>matches(value.rarity,r)) || !record(value.baseStats)) return false;
  const stats = value.baseStats;
  if (!ADVENTURER_STAT_KEYS.every(key=>integer(stats[key],1) && (stats[key] as number)<=30) ||
      value.totalBaseStats !== ADVENTURER_STAT_KEYS.reduce((sum,key)=>sum+(stats[key] as number),0) ||
      !record(value.rarity) || value.totalBaseStats !== value.rarity.statPool) return false;
  if (!Array.isArray(value.startingSkills) || value.startingSkills.length < 1 || value.startingSkills.length > 4 ||
      !Array.from(value.startingSkills).every(s=>Object.values(SKILL_POOLS).flat().some(def=>matches(s,def)))) return false;
  if (new Set(value.startingSkills.map(s=>s.id)).size !== value.startingSkills.length) return false;
  if (!Array.isArray(value.traits) || !Array.from(value.traits).every(t=>TRAIT_REGISTRY.some(def=>matches(t,def)))) return false;
  const ids = new Set(value.traits.map(t=>t.id));
  return ids.size === value.traits.length && value.traits.every(t=>!t.conflicts.some((id:string)=>ids.has(id)));
}
export function parseGuild(value: unknown): GuildData {
  if (!record(value) || ![1, 2, GUILD_SCHEMA_VERSION].includes(value.schemaVersion as number) || !text(value.id) || !text(value.name) ||
      validateGuildName(value.name) !== value.name || !integer(value.level,1) || !integer(value.gold,0) ||
      typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) ||
      new Date(value.createdAt).toISOString() !== value.createdAt || !Array.isArray(value.roster) ||
      value.roster.length > GUILD_ROSTER_CAPACITY || !Array.from(value.roster).every(validAdventurer) ||
      new Set(value.roster.map(a=>a.id)).size !== value.roster.length) {
    throw new Error("Invalid Guild data or unsupported schema. Saved data has been preserved.");
  }
  const pending = value.schemaVersion === 1 ? null : value.pendingRecruit;
  if (value.schemaVersion === 1 && value.pendingRecruit !== undefined && value.pendingRecruit !== null) throw new Error("Unexpected legacy pending data; saved data preserved.");
  if (pending !== null && (!validAdventurer(pending) || (value.roster as RosterAdventurer[]).some(a=>a.id===pending.id))) throw new Error("Invalid pending recruit.");
  const party: unknown = value.schemaVersion === GUILD_SCHEMA_VERSION ? value.activeParty : { memberIds: [], leaderId: null };
  if (!record(party) || !Array.isArray(party.memberIds) || party.memberIds.length > PARTY_CAPACITY ||
      !Array.from(party.memberIds).every(id => text(id) && (value.roster as RosterAdventurer[]).some(a => a.id === id)) ||
      new Set(party.memberIds).size !== party.memberIds.length ||
      (party.leaderId !== null && !party.memberIds.includes(party.leaderId))) {
    throw new Error("Invalid Party references or membership. Saved data has been preserved.");
  }
  const activeParty = { memberIds: [...party.memberIds], leaderId: party.leaderId };
  return structuredClone({...value, activeParty, schemaVersion: GUILD_SCHEMA_VERSION, pendingRecruit: pending}) as unknown as GuildData;
}
