import { describe, expect, it } from "vitest";
import type { AdventurerStats } from "../src/stats.js";
import {
  MAX_STARTING_SKILLS,
  SKILL_POOLS,
  SKILL_TIERS,
  STARTING_SKILL_CHANCE_BY_RARITY,
  STAT_VALUE_BRACKETS,
  TIER_WEIGHT_MATRIX_V2,
  calculateSkillChance,
  generateStartingSkills,
  getSkillAttempts,
  normalizeTierWeights,
  selectSkillTier,
  selectUnownedSkillFromStatPool,
  sortStatsForSkillRolls
} from "../src/skills.js";

const EQUAL_STATS: AdventurerStats = { STR: 10, AGI: 10, VIT: 10, DEX: 10, INT: 10, LUK: 10 };

describe("starting skill chance", () => {
  it.each([
    ["Common", 0, 15], ["Common", 1, 4], ["Common", 2, 1], ["Common", 3, 0.2],
    ["Uncommon", 0, 20], ["Uncommon", 1, 6], ["Uncommon", 2, 1.5], ["Uncommon", 3, 0.4],
    ["Rare", 0, 25], ["Rare", 1, 8], ["Rare", 2, 2], ["Rare", 3, 0.6],
    ["Epic", 0, 30], ["Epic", 1, 10], ["Epic", 2, 3], ["Epic", 3, 1],
    ["Legendary", 0, 35], ["Legendary", 1, 12], ["Legendary", 2, 4], ["Legendary", 3, 1.5]
  ])("uses %s chance with %s acquired skills", (rarity, acquiredSkills, expectedChance) => {
    expect(calculateSkillChance(rarity, acquiredSkills, 0)).toBe(expectedChance);
  });

  it("adds failure bonus to the selected baseline and clamps the result", () => {
    expect(calculateSkillChance("Common", 0, 1)).toBe(16);
    expect(calculateSkillChance("Common", 1, 1)).toBe(5);
    expect(calculateSkillChance("Legendary", 0, 100)).toBe(100);
  });

  it("adds one point after a failure and resets the bonus after success", () => {
    const values = [0.15, 0.159, 0, 0.039, ...Array<number>(20).fill(0.99)];
    const random = () => values.shift() ?? 0.99;
    const skills = generateStartingSkills("Common", EQUAL_STATS, random);

    expect(skills).toHaveLength(1);
    expect(skills[0]?.stat).toBe("STR");
    expect(skills[0]?.tier).toBe("A");
  });

  it("persists failure bonus when moving to the next Stat Pool", () => {
    const values = [0.15, 0.16, 0.17, 0, ...Array<number>(20).fill(0.99)];
    const random = () => values.shift() ?? 0.99;
    const skills = generateStartingSkills("Common", EQUAL_STATS, random);

    expect(skills[0]?.stat).toBe("AGI");
  });
});

describe("stat ordering and attempts", () => {
  it("sorts high to low and breaks ties by STR, AGI, VIT, DEX, INT, LUK", () => {
    const stats: AdventurerStats = { STR: 20, AGI: 30, VIT: 30, DEX: 12, INT: 12, LUK: 1 };

    expect(sortStatsForSkillRolls(stats).map(({ stat }) => stat)).toEqual([
      "AGI", "VIT", "STR", "DEX", "INT", "LUK"
    ]);
  });

  it.each([
    [1, 2], [10, 2], [11, 4], [20, 4], [21, 4], [30, 4]
  ])("assigns %s attempts to stat value %s", (statValue, attempts) => {
    expect(getSkillAttempts(statValue)).toBe(attempts);
  });
});

describe("starting skill results", () => {
  it("caps results at four unique skills", () => {
    const highStats: AdventurerStats = { STR: 30, AGI: 29, VIT: 28, DEX: 27, INT: 26, LUK: 25 };
    const skills = generateStartingSkills("Legendary", highStats, () => 0);

    expect(skills).toHaveLength(MAX_STARTING_SKILLS);
    expect(new Set(skills.map((skill) => skill.id)).size).toBe(skills.length);
  });

  it("allows repeated Stat Pool acquisitions while rerolling an owned Tier", () => {
    const values = [0, 0, 0, 0, 0.1, 0.02, 0, 0.1, 0.5, ...Array<number>(40).fill(1)];
    const random = () => values.shift() ?? 1;
    const stats: AdventurerStats = { STR: 30, AGI: 10, VIT: 10, DEX: 10, INT: 10, LUK: 10 };
    const skills = generateStartingSkills("Common", stats, random);

    expect(skills.slice(0, 3).map((skill) => skill.id)).toEqual(["STR:A", "STR:B", "STR:C"]);
    expect(skills).toHaveLength(3);
    expect(new Set(skills.map((skill) => skill.id)).size).toBe(skills.length);
  });

  it("does not change acquisition chance during duplicate Tier rerolls", () => {
    const values = [0, 0, 0, 0, 0.1, 0.04, ...Array<number>(40).fill(1)];
    const random = () => values.shift() ?? 1;
    const stats: AdventurerStats = { STR: 30, AGI: 10, VIT: 10, DEX: 10, INT: 10, LUK: 10 };
    const skills = generateStartingSkills("Common", stats, random);

    expect(skills.map((skill) => skill.id)).toEqual(["STR:A", "STR:B"]);
  });

  it("falls back to another unowned skill in the same Stat Pool after duplicate Tier rerolls", () => {
    const owned = new Set(["STR:A"]);
    const values = [0, 0.85];
    const skill = selectUnownedSkillFromStatPool("STR", 10, owned, () => values.shift() ?? 1);

    expect(skill?.id).toBe("STR:B");
  });

  it("returns safely when every skill in the selected Stat Pool is already owned", () => {
    const owned = new Set(SKILL_POOLS.STR.map((skill) => skill.id));
    let calls = 0;
    const skill = selectUnownedSkillFromStatPool("STR", 10, owned, () => {
      calls += 1;
      return 0;
    });

    expect(skill).toBeUndefined();
    expect(calls).toBe(SKILL_TIERS.length);
  });

  it("guarantees a skill from the final stat pool when every roll fails", () => {
    let rollCount = 0;
    const random = () => rollCount++ < 12 ? 0.99 : 1;
    const skills = generateStartingSkills("Common", EQUAL_STATS, random);

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ name: "โชค J", stat: "LUK", tier: "J" });
  });

  it("defines 60 distinct placeholder skills across six stat pools", () => {
    const allSkills = Object.values(SKILL_POOLS).flat();

    expect(allSkills).toHaveLength(60);
    expect(new Set(allSkills.map((skill) => skill.name)).size).toBe(60);
    for (const pool of Object.values(SKILL_POOLS)) {
      expect(pool.map((skill) => skill.tier)).toEqual(SKILL_TIERS);
    }
  });
});

describe("V2 weighted tier selection", () => {
  it("normalizes each of the ten rows to 100% with every tier nonzero", () => {
    for (const bracket of STAT_VALUE_BRACKETS) {
      const weights = normalizeTierWeights(TIER_WEIGHT_MATRIX_V2[bracket]);
      const values = Object.values(weights);

      expect(values.reduce((sum, weight) => sum + weight, 0)).toBe(100);
      expect(values.every((weight) => weight > 0)).toBe(true);
    }
  });

  it("keeps every tier selectable in every stat bracket and favors the matching tier", () => {
    for (let bracketIndex = 0; bracketIndex < STAT_VALUE_BRACKETS.length; bracketIndex += 1) {
      const bracket = STAT_VALUE_BRACKETS[bracketIndex]!;
      const weights = normalizeTierWeights(TIER_WEIGHT_MATRIX_V2[bracket]);
      const statValue = bracketIndex * 10 + 1;

      let cumulative = 0;
      for (const tier of SKILL_TIERS) {
        const roll = (cumulative + weights[tier] / 2) / 100;
        expect(selectSkillTier(statValue, () => roll)).toBe(tier);
        cumulative += weights[tier];
      }

      expect(selectSkillTier(statValue, () => 0.5)).toBe(SKILL_TIERS[bracketIndex]);
    }
  });
});