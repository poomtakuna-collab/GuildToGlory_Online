import { TRAIT_REGISTRY, type TraitDefinition } from "./traitRegistry.js";

function shuffleTraits(traits: readonly TraitDefinition[], random: () => number): TraitDefinition[] {
  const shuffled = [...traits];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.min(index, Math.floor(random() * (index + 1)));
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex]!, shuffled[index]!];
  }
  return shuffled;
}

function validateTraitProbability(trait: TraitDefinition): void {
  if (!Number.isFinite(trait.probability) || trait.probability < 0 || trait.probability > 1) {
    throw new RangeError(`Trait probability must be between 0 and 1: ${trait.id}`);
  }
}

function conflictsWithSelected(trait: TraitDefinition, selected: readonly TraitDefinition[]): boolean {
  return selected.some((existing) => (
    trait.conflicts.includes(existing.id) || existing.conflicts.includes(trait.id)
  ));
}

export function generateTraits(
  registry: readonly TraitDefinition[] = TRAIT_REGISTRY,
  random: () => number = Math.random
): TraitDefinition[] {
  for (const trait of registry) validateTraitProbability(trait);

  const selected: TraitDefinition[] = [];
  const selectedIds = new Set<string>();

  for (const trait of shuffleTraits(registry, random)) {
    if (selectedIds.has(trait.id) || conflictsWithSelected(trait, selected)) continue;
    if (random() < trait.probability) {
      selected.push(trait);
      selectedIds.add(trait.id);
    }
  }

  return selected;
}