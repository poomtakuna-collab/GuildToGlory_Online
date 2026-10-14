import { generateStartingSkills, type StartingSkill } from "./skills.js";
import { ADVENTURER_STAT_KEYS, type AdventurerStats } from "./stats.js";
import { generateTraits } from "./traitGenerator.js";
import { TRAIT_REGISTRY, type TraitDefinition } from "./traitRegistry.js";

export { ADVENTURER_STAT_KEYS } from "./stats.js";
export type { AdventurerStat, AdventurerStats } from "./stats.js";

export interface RarityConfiguration {
  name: string;
  statPool: number;
  probability: number;
  colorName: string;
  colorHex: string;
}

export const RARITY_CONFIG = [
  { name: "Common", statPool: 70, probability: 25, colorName: "White", colorHex: "#e5e2d8" },
  { name: "Uncommon", statPool: 75, probability: 25, colorName: "Green", colorHex: "#83c78c" },
  { name: "Rare", statPool: 80, probability: 20, colorName: "Blue", colorHex: "#7bc6e4" },
  { name: "Epic", statPool: 90, probability: 20, colorName: "Purple", colorHex: "#bd92e8" },
  { name: "Legendary", statPool: 100, probability: 10, colorName: "Gold", colorHex: "#e8c75f" }
] as const satisfies readonly RarityConfiguration[];

const FIRST_NAMES = ["Alden", "Bryn", "Celia", "Darian", "Elowen", "Finn", "Galen", "Hana", "Iris", "Joren", "Kira", "Lio"];
const FAMILY_NAMES = ["Ashford", "Briar", "Crestfall", "Dawnmere", "Emberlain", "Fairwind", "Greenvale", "Holloway", "Ironwood", "Juniper", "Kestrel", "Larkspur"];

export interface GeneratedAdventurer {
  name: string;
  level: 1;
  race: "Human";
  className: null;
  rarity: RarityConfiguration;
  baseStats: AdventurerStats;
  totalBaseStats: number;
  startingSkills: StartingSkill[];
  traits: TraitDefinition[];
}

type RandomSource = () => number;

function randomIndex(length: number, random: RandomSource): number {
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}

function chooseRarity(configurations: readonly RarityConfiguration[], random: RandomSource): RarityConfiguration {
  const totalProbability = configurations.reduce((total, rarity) => total + rarity.probability, 0);
  if (configurations.length === 0 || totalProbability <= 0) {
    throw new RangeError("At least one rarity with a positive probability is required");
  }

  let roll = random() * totalProbability;
  for (const rarity of configurations) {
    if (roll < rarity.probability) return rarity;
    roll -= rarity.probability;
  }

  return configurations[configurations.length - 1]!;
}

function generateBaseStats(total: number, random: RandomSource): AdventurerStats {
  const maximumPerStat = 30;
  const minimumTotal = ADVENTURER_STAT_KEYS.length;
  const maximumTotal = ADVENTURER_STAT_KEYS.length * maximumPerStat;
  if (!Number.isInteger(total) || total < minimumTotal || total > maximumTotal) {
    throw new RangeError(`Stat pool must be an integer between ${minimumTotal} and ${maximumTotal}`);
  }

  const stats = Object.fromEntries(ADVENTURER_STAT_KEYS.map((stat) => [stat, 1])) as AdventurerStats;
  let remaining = total - minimumTotal;

  while (remaining > 0) {
    const eligibleStats = ADVENTURER_STAT_KEYS.filter((stat) => stats[stat] < maximumPerStat);
    const selectedStat = eligibleStats[randomIndex(eligibleStats.length, random)]!;
    stats[selectedStat] += 1;
    remaining -= 1;
  }

  return stats;
}

export function generateAdventurer(
  random: RandomSource = Math.random,
  rarityConfigurations: readonly RarityConfiguration[] = RARITY_CONFIG,
  traitRandom: RandomSource = Math.random
): GeneratedAdventurer {
  const rarity = chooseRarity(rarityConfigurations, random);
  const firstName = FIRST_NAMES[randomIndex(FIRST_NAMES.length, random)]!;
  const familyName = FAMILY_NAMES[randomIndex(FAMILY_NAMES.length, random)]!;
  const baseStats = generateBaseStats(rarity.statPool, random);
  const totalBaseStats = Object.values(baseStats).reduce((total, stat) => total + stat, 0);

  return {
    name: `${firstName} ${familyName}`,
    level: 1,
    race: "Human",
    className: null,
    rarity,
    baseStats,
    totalBaseStats,
    startingSkills: generateStartingSkills(rarity.name, baseStats, random),
    traits: generateTraits(TRAIT_REGISTRY, traitRandom)
  };
}