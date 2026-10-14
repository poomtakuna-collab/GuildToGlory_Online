export const ADVENTURER_STAT_KEYS = ["STR", "AGI", "VIT", "DEX", "INT", "LUK"] as const;

export type AdventurerStat = typeof ADVENTURER_STAT_KEYS[number];
export type AdventurerStats = Record<AdventurerStat, number>;