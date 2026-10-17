import { isProfileId } from "@guild-to-glory/shared";
import type { GuildStorage } from "./guildStorage.js";
export const LOCAL_PROFILE_STORAGE_KEY = "guild-to-glory.local-profile";
/** Separate key: migration never rewrites Guild, gold or adventurer IDs. */
export function getOrCreateLocalProfile(storage: GuildStorage): string {
  const existing=storage.getItem(LOCAL_PROFILE_STORAGE_KEY);
  if(existing!==null) {
    if(!isProfileId(existing)) throw Error("Invalid local profile ID. Existing Guild data has been preserved.");
    return existing;
  }
  const id=crypto.randomUUID();
  storage.setItem(LOCAL_PROFILE_STORAGE_KEY,id);
  return id;
}
export async function loadLocalProfile(): Promise<string> {
  const read=()=>getOrCreateLocalProfile(window.localStorage);
  return navigator.locks ? navigator.locks.request(LOCAL_PROFILE_STORAGE_KEY,read) : read();
}
