import { describe, expect, it } from "vitest";
import { ADVENTURER_STAT_KEYS, RARITY_CONFIG, generateAdventurer } from "../src/adventurer.js";

function randomForRarity(targetName: string): () => number {
  const target = RARITY_CONFIG.find((rarity) => rarity.name === targetName)!;
  const targetIndex = RARITY_CONFIG.indexOf(target);
  const before = RARITY_CONFIG.slice(0, targetIndex).reduce((sum, rarity) => sum + rarity.probability, 0);
  const rarityRoll = (before + target.probability / 2) / 100;
  let callCount = 0;

  return () => {
    callCount += 1;
    if (callCount === 1) return rarityRoll;
    return (callCount * 37 % 97) / 97;
  };
}

describe("generateAdventurer", () => {
  it.each(RARITY_CONFIG)("generates valid base stats for $name", (rarity) => {
    const adventurer = generateAdventurer(randomForRarity(rarity.name));
    const stats = Object.values(adventurer.baseStats);

    expect(adventurer.rarity.name).toBe(rarity.name);
    expect(adventurer.totalBaseStats).toBe(rarity.statPool);
    expect(stats.reduce((total, stat) => total + stat, 0)).toBe(rarity.statPool);
    expect(stats).toHaveLength(ADVENTURER_STAT_KEYS.length);
    expect(stats.every((stat) => Number.isInteger(stat) && stat >= 1 && stat <= 30)).toBe(true);
  });

  it("generates a named Level 1 human with no class", () => {
    const adventurer = generateAdventurer(() => 0.1);

    expect(adventurer.name.trim().split(" ")).toHaveLength(2);
    expect(adventurer.level).toBe(1);
    expect(adventurer.race).toBe("Human");
    expect(adventurer.className).toBeNull();
  });

  it("preserves the M3.1 Base Stat distribution when adding skill generation", () => {
    const adventurer = generateAdventurer(() => 0.1);

    expect(adventurer.baseStats).toEqual({ STR: 30, AGI: 30, VIT: 7, DEX: 1, INT: 1, LUK: 1 });
  });

  it.each([
    [0, "Common"],
    [0.2499, "Common"],
    [0.25, "Uncommon"],
    [0.5, "Rare"],
    [0.7, "Epic"],
    [0.9, "Legendary"]
  ])("selects the rarity at probability roll %s", (roll, expectedRarity) => {
    let callCount = 0;
    const random = () => callCount++ === 0 ? roll : 0.4;

    expect(generateAdventurer(random).rarity.name).toBe(expectedRarity);
  });
});