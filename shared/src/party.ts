import { parseGuild, PARTY_CAPACITY, type GuildData } from "./guild.js";

export type PartyAction =
  | { type: "add"; id: string }
  | { type: "remove"; id: string }
  | { type: "setLeader"; id: string }
  | { type: "replace"; id: string; replacementId: string }
  | { type: "clear" };

/** Readiness is derived, never persisted; a partial party with a leader is ready. */
export function isPartyReady(current: GuildData): boolean {
  try { return parseGuild(current).activeParty.leaderId !== null; }
  catch { return false; }
}

/** Immutable transition; persist the entire Guild before displaying success. */
export function applyParty(current: GuildData, action: PartyAction): GuildData {
  const guild = parseGuild(current);
  const party = guild.activeParty;
  const requireMember = (id: string) => {
    if (!party.memberIds.includes(id)) throw new Error("Adventurer is not in the Party.");
  };
  const requireAvailable = (id: string) => {
    if (!guild.roster.some(a => a.id === id)) throw new Error("Adventurer is not in the Guild roster.");
    if (party.memberIds.includes(id)) throw new Error("Adventurer is already in the Party.");
  };
  switch (action.type) {
    case "add":
      requireAvailable(action.id);
      if (party.memberIds.length >= PARTY_CAPACITY) throw new Error("Party full (4/4).");
      party.memberIds.push(action.id);
      break;
    case "remove":
      requireMember(action.id);
      party.memberIds = party.memberIds.filter(id => id !== action.id);
      if (party.leaderId === action.id) party.leaderId = null;
      break;
    case "setLeader":
      requireMember(action.id);
      party.leaderId = action.id;
      break;
    case "replace":
      requireMember(action.id);
      requireAvailable(action.replacementId);
      party.memberIds[party.memberIds.indexOf(action.id)] = action.replacementId;
      if (party.leaderId === action.id) party.leaderId = null;
      break;
    case "clear":
      party.memberIds = [];
      party.leaderId = null;
      break;
  }
  return parseGuild(guild);
}
