import { createPartySnapshot, NETWORK_MESSAGES } from "@guild-to-glory/shared";
import type { GuildRepository } from "./guildStorage.js";
interface PartyConnection { send(type: string, message: unknown): void }
/** New instance per connection: revisions are scoped to that transport session. */
export function createPartySync(room: PartyConnection, repository: GuildRepository, profileId: string, report: (message: string)=>void) {
  let revision=0;
  let active=true;
  return {
    stop() { active=false; },
    sync() {
      if(!active)return;
      try {
        const loaded=repository.load();
        if(loaded.status==="error") throw Error(loaded.message);
        const snapshot=createPartySnapshot(loaded.status==="ready"?loaded.guild:null,profileId,++revision);
        room.send(NETWORK_MESSAGES.partySnapshot,snapshot);
        report("Sending current Guild / Party snapshot...");
      } catch(error) { report("Party sync failed: "+(error instanceof Error ? error.message : "Unable to read local Guild.")); }
    }
  };
}
