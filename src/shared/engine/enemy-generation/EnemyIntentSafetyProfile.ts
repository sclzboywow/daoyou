import type { CreationProductType } from '@shared/engine/creation-v2/types';
import type { ElementType, EquipmentSlot } from '@shared/types/constants';
import type { EnemyProductRole } from './types';

const ELEMENTAL_DAMAGE_CORE: Record<ElementType, string> = {
  金: 'skill-core-damage-metal',
  木: 'skill-core-damage-wood',
  水: 'skill-core-damage-water',
  火: 'skill-core-damage-fire',
  土: 'skill-core-damage-earth',
  风: 'skill-core-damage-wind',
  雷: 'skill-core-damage-thunder',
  冰: 'skill-core-damage-ice',
};

const TECHNIQUE_CORE_BY_ELEMENT: Record<ElementType, string> = {
  金: 'gongfa-foundation-atk',
  木: 'gongfa-foundation-vitality',
  水: 'gongfa-foundation-spirit',
  火: 'gongfa-foundation-magic-atk',
  土: 'gongfa-foundation-def',
  风: 'gongfa-foundation-speed',
  雷: 'gongfa-foundation-control-hit',
  冰: 'gongfa-foundation-magic-def',
};

export interface EnemyIntentSafetyProfile {
  readonly excludedAffixIds: readonly string[];
  getFallbackAffixIds(args: {
    productType: CreationProductType;
    role: EnemyProductRole;
    element: ElementType;
    slot?: EquipmentSlot;
  }): string[];
}

export class DefaultEnemyIntentSafetyProfile
  implements EnemyIntentSafetyProfile
{
  readonly excludedAffixIds = [
    'skill-rare-soul-rend',
    'gongfa-secret-frost-soul',
  ] as const;

  getFallbackAffixIds(args: {
    productType: CreationProductType;
    role: EnemyProductRole;
    element: ElementType;
    slot?: EquipmentSlot;
  }): string[] {
    if (args.productType === 'gongfa') {
      return [TECHNIQUE_CORE_BY_ELEMENT[args.element]];
    }

    if (args.productType === 'skill') {
      switch (args.role) {
        case 'control':
          return [
            ELEMENTAL_DAMAGE_CORE[args.element],
            'skill-variant-control-stun',
          ];
        case 'guard':
          return args.element === '冰'
            ? ['skill-core-ice-frost-guard']
            : ['skill-core-guard-aura'];
        case 'sustain':
          return args.element === '木'
            ? ['skill-core-heal', 'skill-core-wood-regrowth']
            : ['skill-core-heal'];
        case 'offense':
        default:
          return [ELEMENTAL_DAMAGE_CORE[args.element]];
      }
    }

    switch (args.slot) {
      case 'armor':
        return [
          'artifact-panel-armor-dual-def',
          'artifact-panel-def',
          'artifact-defense-armor-passive',
        ];
      case 'accessory':
        return [
          'artifact-panel-accessory-utility',
          'artifact-panel-spirit',
          'artifact-defense-debuff-cleanse',
        ];
      case 'weapon':
      default:
        return [
          'artifact-panel-weapon-dual-atk',
          'artifact-panel-atk',
          'artifact-defense-mana-recovery',
        ];
    }
  }
}

export const DEFAULT_ENEMY_INTENT_SAFETY_PROFILE =
  new DefaultEnemyIntentSafetyProfile();
