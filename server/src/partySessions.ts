import { parsePartySnapshot, summarizeParty, type PartySnapshot, type PartyStateMessage, type PartyResultMessage } from "@guild-to-glory/shared";

/** Room-owned state. Identity is always supplied by the transport, never the payload. */
export class PartySessions {
  private readonly sessions = new Map<string, PartySnapshot | null>();
  join(sessionId: string): void { this.sessions.set(sessionId,null); }
  leave(sessionId: string): void { this.sessions.delete(sessionId); }
  receive(sessionId: string, payload: unknown): PartyResultMessage {
    try {
      if(!this.sessions.has(sessionId)) throw Error("Session is no longer connected.");
      const next=parsePartySnapshot(payload);
      const previous=this.sessions.get(sessionId);
      if(previous && next.revision<=previous.revision) return {revision:next.revision,ok:false,message:"Snapshot is stale or already applied."};
      this.sessions.set(sessionId,next);
      return {revision:next.revision,ok:true,message:"Party snapshot synchronized."};
    } catch(error) { return {revision:null,ok:false,message:error instanceof Error ? error.message : "Invalid Party snapshot."}; }
  }
  state(): PartyStateMessage {
    return {parties:Array.from(this.sessions,([sessionId,snapshot])=>snapshot ? summarizeParty(sessionId,snapshot) :
      {sessionId,guildId:null,guildName:null,memberIds:[],leaderId:null,members:[],ready:false})};
  }
}
