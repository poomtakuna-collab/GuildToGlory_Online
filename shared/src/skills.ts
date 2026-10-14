import { ADVENTURER_STAT_KEYS, type AdventurerStat, type AdventurerStats } from "./stats.js";

export const SKILL_TIERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;
export type SkillTier = typeof SKILL_TIERS[number];

export const SKILL_STAT_LABELS: Record<AdventurerStat, string> = {
  STR: "ดาบ",
  AGI: "หลบ",
  VIT: "ป้องกัน",
  DEX: "ธนู",
  INT: "เวท",
  LUK: "โชค"
};

export interface PlaceholderSkill {
  id: string;
  name: string;
  stat: AdventurerStat;
  tier: SkillTier;
}

function createSkillPool(stat: AdventurerStat): readonly PlaceholderSkill[] {
  return SKILL_TIERS.map((tier) => ({ id: `${stat}:${tier}`, name: `${SKILL_STAT_LABELS[stat]} ${tier}`, stat, tier }));
}

export const SKILL_POOLS: Record<AdventurerStat, readonly PlaceholderSkill[]> = {
  STR: createSkillPool("STR"),
  AGI: createSkillPool("AGI"),
  VIT: createSkillPool("VIT"),
  DEX: createSkillPool("DEX"),
  INT: createSkillPool("INT"),
  LUK: createSkillPool("LUK")
};

export const STARTING_SKILL_CHANCE_BY_RARITY = {
  Common: [15, 4, 1, 0.2],
  Uncommon: [20, 6, 1.5, 0.4],
  Rare: [25, 8, 2, 0.6],
  Epic: [30, 10, 3, 1],
  Legendary: [35, 12, 4, 1.5]
} as const;

export const SKILL_FAILURE_BONUS_PERCENT = 1;
export const MAX_STARTING_SKILLS = 4;

export const STAT_VALUE_BRACKETS = [
  "1-10", "11-20", "21-30", "31-40", "41-50",
  "51-60", "61-70", "71-80", "81-90", "91-100"
] as const;
export type StatValueBracket = typeof STAT_VALUE_BRACKETS[number];

export const TIER_WEIGHT_MATRIX_V2 = {
  "1-10": [85, 9, 3, 1.5, 0.7, 0.35, 0.2, 0.12, 0.08, 0.05],
  "11-20": [18, 65, 12, 3, 1, 0.5, 0.2, 0.15, 0.1, 0.05],
  "21-30": [6, 22, 60, 8, 2, 1, 0.4, 0.3, 0.2, 0.1],
  "31-40": [2, 7, 22, 59, 7, 1.5, 0.7, 0.4, 0.25, 0.15],
  "41-50": [0.5, 2, 7, 22, 59, 7, 1.5, 0.6, 0.25, 0.15],
  "51-60": [0.2, 0.5, 2, 7, 22, 59, 7, 1.5, 0.5, 0.3],
  "61-70": [0.15, 0.2, 0.5, 2, 7, 22, 59, 7, 1.5, 0.65],
  "71-80": [0.1, 0.15, 0.25, 0.5, 2, 7, 22, 59, 7, 2],
  "81-90": [0.1, 0.1, 0.15, 0.25, 0.5, 2, 7, 22, 60, 7.9],
  "91-100": [0.05, 0.08, 0.12, 0.2, 0.35, 0.7, 1.5, 3, 9, 85]
} as const satisfies Record<StatValueBracket, readonly number[]>;

export interface StartingSkill extends PlaceholderSkill {}

export function getSkillAttempts(statValue: number): number {
  if (!Number.isInteger(statValue) || statValue < 1 || statValue > 30) {
    throw new RangeError("A generated stat value must be an integer between 1 and 30");
  }

  return statValue <= 10 ? 2 : 4;
}

export function sortStatsForSkillRolls(stats: AdventurerStats): Array<{ stat: AdventurerStat; value: number }> {
  return ADVENTURER_STAT_KEYS
    .map((stat) => ({ stat, value: stats[stat] }))
    .sort((left, right) => right.value - left.value || ADVENTURER_STAT_KEYS.indexOf(left.stat) - ADVENTURER_STAT_KEYS.indexOf(right.stat));
}

export function calculateSkillChance(rarityName: string, acquiredSkillCount: number, failureBonus: number): number {
  const chances = STARTING_SKILL_CHANCE_BY_RARITY[rarityName as keyof typeof STARTING_SKILL_CHANCE_BY_RARITY];
  if (chances === undefined) throw new RangeError(`Unsupported rarity: ${rarityName}`);
  if (!Number.isInteger(acquiredSkillCount) || acquiredSkillCount < 0 || acquiredSkillCount >= chances.length) {
    throw new RangeError("Skill chance requires an acquired skill count between 0 and 3");
  }

  const chance = chances[acquiredSkillCount]! + failureBonus;
  return Math.max(0, Math.min(100, chance));
}

export function normalizeTierWeights(rawWeights: readonly number[]): Record<SkillTier, number> {
  if (
    rawWeights.length !== SKILL_TIERS.length ||
    rawWeights.some((weight) => !Number.isFinite(weight) || weight <= 0)
  ) {
    throw new RangeError("Every tier must have a positive finite weight");
  }

  const total = rawWeights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(total) || total <= 0) throw new RangeError("Tier weights must have a positive finite total");

  const normalized = {} as Record<SkillTier, number>;
  let assignedTotal = 0;
  for (let index = 0; index < SKILL_TIERS.length - 1; index += 1) {
    const tier = SKILL_TIERS[index]!;
    const weight = rawWeights[index]! / total * 100;
    normalized[tier] = weight;
    assignedTotal += weight;
  }
  normalized[SKILL_TIERS[SKILL_TIERS.length - 1]!] = 100 - assignedTotal;

  return normalized;
}

export function getStatValueBracket(statValue: number): StatValueBracket {
  if (!Number.isInteger(statValue) || statValue < 1 || statValue > 100) {
    throw new RangeError("Tier weighting requires an integer stat value between 1 and 100");
  }

  const lowerBound = Math.floor((statValue - 1) / 10) * 10 + 1;
  return `${lowerBound}-${lowerBound + 9}` as StatValueBracket;
}

export function selectSkillTier(
  statValue: number,
  random: () => number = Math.random,
  weightMatrix: typeof TIER_WEIGHT_MATRIX_V2 = TIER_WEIGHT_MATRIX_V2
): SkillTier {
  const bracket = getStatValueBracket(statValue);
  const weights = normalizeTierWeights(weightMatrix[bracket]);
  let roll = random() * 100;

  for (const tier of SKILL_TIERS) {
    if (roll < weights[tier]) return tier;
    roll -= weights[tier];
  }

  return SKILL_TIERS[SKILL_TIERS.length - 1]!;
}

function randomIndex(length: number, random: () => number): number {
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}

export function selectUnownedSkillFromStatPool(
  stat: AdventurerStat,
  statValue: number,
  ownedSkillIds: ReadonlySet<string>,
  random: () => number = Math.random
): StartingSkill | undefined {
  const pool = SKILL_POOLS[stat];

  for (let reroll = 0; reroll < SKILL_TIERS.length; reroll += 1) {
    const tier = selectSkillTier(statValue, random);
    const unownedSkills = pool.filter((skill) => skill.tier === tier && !ownedSkillIds.has(skill.id));
    if (unownedSkills.length > 0) return unownedSkills[randomIndex(unownedSkills.length, random)]!;
  }

  const remainingSkills = pool.filter((skill) => !ownedSkillIds.has(skill.id));
  if (remainingSkills.length === 0) return undefined;
  return remainingSkills[randomIndex(remainingSkills.length, random)]!;
}

export function generateStartingSkills(
  rarityName: string,
  baseStats: AdventurerStats,
  random: () => number = Math.random
): StartingSkill[] {
  const orderedStats = sortStatsForSkillRolls(baseStats);
  const startingSkills: StartingSkill[] = [];
  const acquiredIds = new Set<string>();
  let failureBonus = 0;
  let currentStat = orderedStats[0]!;

  for (const entry of orderedStats) {
    currentStat = entry;
    const attempts = getSkillAttempts(entry.value);

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (startingSkills.length >= MAX_STARTING_SKILLS) return startingSkills;

      const chance = calculateSkillChance(rarityName, startingSkills.length, failureBonus);
      if (random() * 100 < chance) {
        const skill = selectUnownedSkillFromStatPool(entry.stat, entry.value, acquiredIds, random);
        if (skill) {
          startingSkills.push(skill);
          acquiredIds.add(skill.id);
          failureBonus = 0;
        }
      } else {
        failureBonus += SKILL_FAILURE_BONUS_PERCENT;
      }
    }
  }

  if (startingSkills.length === 0) {
    const guaranteedSkill = selectUnownedSkillFromStatPool(currentStat.stat, currentStat.value, acquiredIds, random);
    if (guaranteedSkill) startingSkills.push(guaranteedSkill);
  }

  return startingSkills;
}