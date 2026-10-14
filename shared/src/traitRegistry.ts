export type TraitType = "positive" | "negative";

export interface TraitEffect {
  target: string;
  modifier: "percentage";
  value: number;
  description: string;
}

export interface TraitDefinition {
  id: string;
  name: string;
  category: string;
  type: TraitType;
  probability: number;
  description: string;
  effects: readonly TraitEffect[];
  conflicts: readonly string[];
}

export const INITIAL_TRAIT_PROBABILITY = 0.08;

function defineTrait(
  id: string,
  name: string,
  category: string,
  type: TraitType,
  description: string,
  target: string,
  value: number,
  conflictId: string,
  probability = INITIAL_TRAIT_PROBABILITY
): TraitDefinition {
  return {
    id,
    name,
    category,
    type,
    probability,
    description,
    effects: [{ target, modifier: "percentage", value, description }],
    conflicts: [conflictId]
  };
}

export const TRAIT_REGISTRY: readonly TraitDefinition[] = [
  defineTrait("strong", "Strong", "offense", "positive", "Melee Damage +2%", "meleeDamage", 2, "weak"),
  defineTrait("agile", "Agile", "mobility", "positive", "Movement Speed +2%", "movementSpeed", 2, "clumsy"),
  defineTrait("tough", "Tough", "survivability", "positive", "Max HP +2%", "maxHp", 2, "frail"),
  defineTrait("brave", "Brave", "resistance", "positive", "Fear Resistance +5%", "fearResistance", 5, "coward"),
  defineTrait("fast-learner", "Fast Learner", "progression", "positive", "EXP Gain +2%", "experienceGain", 2, "slow-learner"),
  defineTrait("keen-eyes", "Keen Eyes", "perception", "positive", "Vision Range +3%", "visionRange", 3, "short-sighted"),
  defineTrait("animal-lover", "Animal Lover", "creatures", "positive", "Damage Taken from Beasts -5%", "beastDamageTaken", -5, "beast-phobia"),
  defineTrait("beast-hunter", "Beast Hunter", "creatures", "positive", "Damage to Beasts +5%", "beastDamage", 5, "poor-hunter"),
  defineTrait("fire-resistant", "Fire Resistant", "elements", "positive", "Fire Damage Taken -3%", "fireDamageTaken", -3, "fire-vulnerable"),
  defineTrait("cold-resistant", "Cold Resistant", "elements", "positive", "Cold Damage Taken -3%", "coldDamageTaken", -3, "cold-vulnerable"),
  defineTrait("quick-recovery", "Quick Recovery", "recovery", "positive", "HP Regeneration +2%", "hpRegeneration", 2, "slow-recovery"),
  defineTrait("efficient", "Efficient", "action-points", "positive", "AP Cost -2%", "apCost", -2, "wasteful"),
  defineTrait("treasure-hunter", "Treasure Hunter", "loot", "positive", "Rare Loot Chance +1%", "rareLootChance", 1, "unlucky-finder"),
  defineTrait("night-owl", "Night Owl", "time", "positive", "Night Movement Speed +3%", "nightMovementSpeed", 3, "sleepyhead"),
  defineTrait("focused", "Focused", "accuracy", "positive", "Skill Accuracy +2%", "skillAccuracy", 2, "distracted"),
  defineTrait("weak", "Weak", "offense", "negative", "Melee Damage -2%", "meleeDamage", -2, "strong"),
  defineTrait("clumsy", "Clumsy", "mobility", "negative", "Movement Speed -2%", "movementSpeed", -2, "agile"),
  defineTrait("frail", "Frail", "survivability", "negative", "Max HP -2%", "maxHp", -2, "tough"),
  defineTrait("coward", "Coward", "resistance", "negative", "Fear Resistance -5%", "fearResistance", -5, "brave"),
  defineTrait("slow-learner", "Slow Learner", "progression", "negative", "EXP Gain -2%", "experienceGain", -2, "fast-learner"),
  defineTrait("short-sighted", "Short Sighted", "perception", "negative", "Vision Range -3%", "visionRange", -3, "keen-eyes"),
  defineTrait("beast-phobia", "Beast Phobia", "creatures", "negative", "Damage Taken from Beasts +5%", "beastDamageTaken", 5, "animal-lover"),
  defineTrait("poor-hunter", "Poor Hunter", "creatures", "negative", "Damage to Beasts -5%", "beastDamage", -5, "beast-hunter"),
  defineTrait("fire-vulnerable", "Fire Vulnerable", "elements", "negative", "Fire Damage Taken +3%", "fireDamageTaken", 3, "fire-resistant"),
  defineTrait("cold-vulnerable", "Cold Vulnerable", "elements", "negative", "Cold Damage Taken +3%", "coldDamageTaken", 3, "cold-resistant"),
  defineTrait("slow-recovery", "Slow Recovery", "recovery", "negative", "HP Regeneration -2%", "hpRegeneration", -2, "quick-recovery"),
  defineTrait("wasteful", "Wasteful", "action-points", "negative", "AP Cost +2%", "apCost", 2, "efficient"),
  defineTrait("unlucky-finder", "Unlucky Finder", "loot", "negative", "Rare Loot Chance -1%", "rareLootChance", -1, "treasure-hunter"),
  defineTrait("sleepyhead", "Sleepyhead", "time", "negative", "Night Movement Speed -3%", "nightMovementSpeed", -3, "night-owl"),
  defineTrait("distracted", "Distracted", "accuracy", "negative", "Skill Accuracy -2%", "skillAccuracy", -2, "focused")
];