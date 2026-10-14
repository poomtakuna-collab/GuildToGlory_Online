import { describe, expect, it } from "vitest";
import { generateTraits } from "../src/traitGenerator.js";
import { TRAIT_REGISTRY, type TraitDefinition, type TraitType } from "../src/traitRegistry.js";

function makeTrait(
  id: string,
  type: TraitType,
  probability = 1,
  conflicts: readonly string[] = []
): TraitDefinition {
  return {
    id,
    name: id,
    category: "test",
    type,
    probability,
    description: "Test effect",
    effects: [{ target: "testValue", modifier: "percentage", value: 1, description: "Test effect" }],
    conflicts
  };
}

describe("generateTraits", () => {
  it("never returns duplicate trait IDs", () => {
    const duplicate = makeTrait("repeat", "positive");
    const traits = generateTraits([duplicate, duplicate, duplicate], () => 0);

    expect(traits.map((trait) => trait.id)).toEqual(["repeat"]);
  });

  it("never selects conflicting traits, including one-sided conflict definitions", () => {
    const selected = generateTraits(TRAIT_REGISTRY.map((trait) => ({ ...trait, probability: 1 })), () => 0);
    const selectedIds = new Set(selected.map((trait) => trait.id));

    for (const trait of selected) {
      expect(trait.conflicts.some((conflictId) => selectedIds.has(conflictId))).toBe(false);
      expect(TRAIT_REGISTRY.some((other) => selectedIds.has(other.id) && other.conflicts.includes(trait.id))).toBe(false);
    }
  });

  it("accepts zero generated traits", () => {
    expect(generateTraits([makeTrait("never", "negative", 0)], () => 0)).toEqual([]);
  });

  it("allows positive and negative traits to coexist when they do not conflict", () => {
    const traits = generateTraits([
      makeTrait("positive-test", "positive"),
      makeTrait("negative-test", "negative")
    ], () => 0);

    expect(traits.map((trait) => trait.type).sort()).toEqual(["negative", "positive"]);
  });

  it("uses the configured individual probability", () => {
    const traits = generateTraits([
      makeTrait("disabled", "positive", 0),
      makeTrait("enabled", "negative", 0.7)
    ], () => 0.5);

    expect(traits.map((trait) => trait.id)).toEqual(["enabled"]);
  });

  it("keeps definitions data-driven and permits registry extension without generator changes", () => {
    const addedTrait = makeTrait("new-registry-entry", "positive");
    const registry = [
      ...TRAIT_REGISTRY.map((trait) => ({ ...trait, probability: 0 })),
      addedTrait
    ];

    expect(generateTraits(registry, () => 0).map((trait) => trait.id)).toContain(addedTrait.id);
    expect(TRAIT_REGISTRY).toHaveLength(30);
    expect(new Set(TRAIT_REGISTRY.map((trait) => trait.id)).size).toBe(30);
    expect(TRAIT_REGISTRY.every((trait) => trait.effects.length >= 1)).toBe(true);
  });
});