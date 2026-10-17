import { parseGuild, type GuildData } from "./guild.js";

export const PARTY_PROTOCOL_VERSION = 1;
export const MAX_PARTY_PAYLOAD_BYTES = 4096;
export interface PartyMemberDisplay { id: string; name: string; rarity: string; level: number }
export interface PartySnapshot {
  protocolVersion: 1;
  revision: number;
  profileId: string;
  guildId: string | null;
  guildName: string | null;
  memberIds: string[];
  leaderId: string | null;
  members: PartyMemberDisplay[];
}
export interface PartySummary {
  sessionId: string;
  guildId: string | null;
  guildName: string | null;
  memberIds: string[];
  leaderId: string | null;
  members: PartyMemberDisplay[];
  ready: boolean;
}
export interface PartyStateMessage { parties: PartySummary[] }
export interface PartyResultMessage { revision: number | null; ok: boolean; message: string }
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const label = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
export const isProfileId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
/** Strict allowlist: economy, session IDs and arbitrary storage data are rejected. */
export function parsePartySnapshot(value: unknown): PartySnapshot {
  const invalid = () => { throw new Error("Invalid Party snapshot: check protocol, fields, size, members and leader."); };
  if (!record(value) || !exact(value,["protocolVersion","revision","profileId","guildId","guildName","memberIds","leaderId","members"])) return invalid();
  if (value.protocolVersion !== PARTY_PROTOCOL_VERSION || !Number.isSafeInteger(value.revision) || (value.revision as number)<1 || !isProfileId(value.profileId)) return invalid();
  if (!Array.isArray(value.memberIds) || value.memberIds.length>4 || !Array.from(value.memberIds).every(id=>label(id,128)) || new Set(value.memberIds).size!==value.memberIds.length) return invalid();
  if (value.leaderId !== null && !value.memberIds.includes(value.leaderId)) return invalid();
  const memberIds=value.memberIds;
  if (!Array.isArray(value.members) || value.members.length!==value.memberIds.length || !Array.from(value.members).every((m,i)=>
    record(m) && exact(m,["id","name","rarity","level"]) && m.id===memberIds[i] && label(m.name,80) &&
    ["Common","Uncommon","Rare","Epic","Legendary"].includes(m.rarity as string) && m.level===1)) return invalid();
  if (value.guildId===null) {
    if(value.guildName!==null || value.memberIds.length!==0 || value.leaderId!==null) return invalid();
  } else if(!label(value.guildId,128) || !label(value.guildName,48) || [...value.guildName].length<3 || [...value.guildName].length>24) return invalid();
  if(new TextEncoder().encode(JSON.stringify(value)).byteLength>MAX_PARTY_PAYLOAD_BYTES) return invalid();
  return structuredClone(value) as unknown as PartySnapshot;
}
export function createPartySnapshot(guild: GuildData | null, profileId: string, revision: number): PartySnapshot {
  const validated=guild===null ? null : parseGuild(guild);
  const memberIds=validated?.activeParty.memberIds ?? [];
  return parsePartySnapshot({protocolVersion:PARTY_PROTOCOL_VERSION,revision,profileId,
    guildId:validated?.id ?? null,guildName:validated?.name ?? null,memberIds,
    leaderId:validated?.activeParty.leaderId ?? null,
    members:memberIds.map(id=>{const a=validated!.roster.find(a=>a.id===id)!;return {id:a.id,name:a.name,rarity:a.rarity.name,level:a.level};})});
}
export function summarizeParty(sessionId: string, snapshot: PartySnapshot): PartySummary {
  const {profileId:_profileId,revision:_revision,protocolVersion:_version,...display}=snapshot;
  return structuredClone({sessionId,...display,ready:snapshot.leaderId!==null});
}
