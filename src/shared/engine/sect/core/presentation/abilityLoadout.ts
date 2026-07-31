import {
  StandardSectRules,
  type SectAbilityId,
  type SectAbilitySlots,
} from '../domain';

export function createAbilitySlots(
  loadout: readonly (SectAbilityId | null)[],
): SectAbilitySlots {
  return Array.from(
    { length: StandardSectRules.activeAbilitySlotCount },
    (_, index) => loadout[index] ?? null,
  ) as SectAbilitySlots;
}
