import { createGuild, parseGuild, type GuildData } from "@guild-to-glory/shared";
export const GUILD_STORAGE_KEY = "guild-to-glory.guild";
export interface GuildStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export type GuildLoadResult = { status: "empty" } | { status: "ready"; guild: GuildData } | { status: "error"; message: string };
export interface GuildRepository { load(): GuildLoadResult; create(name: string): GuildLoadResult; update(change: (guild: GuildData) => GuildData): GuildLoadResult }
/** Never writes on load and never overwrites an existing (even invalid) profile. */
export function createGuildRepository(storage: () => GuildStorage): GuildRepository {
  function load(): GuildLoadResult {
    try {
      const raw = storage().getItem(GUILD_STORAGE_KEY);
      return raw === null ? { status: "empty" } : { status: "ready", guild: parseGuild(JSON.parse(raw)) };
    } catch {
      return { status: "error", message: "Unable to load Guild. Storage is unavailable or saved data is invalid/unsupported. Existing data has not been reset. Restore your saved data or browser storage access before continuing." };
    }
  }
  return { load, update(change) {
    const current=load();
    if(current.status !== "ready") return current.status === "error" ? current : {status:"error",message:"Create a Guild first."};
    try {
      const guild=parseGuild(change(current.guild));
      if(guild.id!==current.guild.id) throw new Error("Guild identity cannot change.");
      storage().setItem(GUILD_STORAGE_KEY,JSON.stringify(guild));
      return {status:"ready",guild};
    } catch(error) { return {status:"error",message:error instanceof Error ? error.message : "Unable to save Guild."}; }
  }, create(name) {
    const current = load();
    if (current.status !== "empty") return current;
    try {
      const guild = createGuild(name);
      storage().setItem(GUILD_STORAGE_KEY, JSON.stringify(guild));
      return { status: "ready", guild };
    } catch (error) {
      return { status: "error", message: error instanceof Error ? "Guild was not saved: " + error.message : "Guild was not saved. Check browser storage access." };
    }
  }};
}
