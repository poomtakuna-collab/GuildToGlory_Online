import type { GuildData } from "@guild-to-glory/shared";
export function addDeveloperGold(guild: GuildData): GuildData {
  if (!import.meta.env.DEV) throw new Error("Developer gold is unavailable in production.");
  const gold=guild.gold+100_000;
  if(!Number.isSafeInteger(guild.gold) || guild.gold<0 || !Number.isSafeInteger(gold)) throw new Error("Gold limit reached.");
  return {...guild,gold};
}
