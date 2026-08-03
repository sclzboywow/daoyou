import type {
  AbilityTransformModifierV3,
  CombatMechanicPayloadV3,
  DamageMemoryReleaseKindV3,
} from './mechanics';
import { isCombatMechanicCuePayloadV3 } from './mechanics';
import type {
  CombatFactV3,
  PresentedLogLineV3,
  PresentedLogPartV3,
} from './types';

type MechanicFactV3 = Extract<CombatFactV3, { type: 'mechanic' }>;
type MechanicKindV3 = CombatMechanicPayloadV3['kind'];
type MechanicPayloadV3<K extends MechanicKindV3> = Extract<
  CombatMechanicPayloadV3,
  { kind: K }
>;
type MechanicFormatterV3<K extends MechanicKindV3> = (
  payload: MechanicPayloadV3<K>,
  fact: MechanicFactV3,
) => PresentedLogPartV3[];
export type CombatMechanicImportanceV3 = 'result' | 'cue';
type MechanicNarrativeDefinitionMapV3 = {
  [K in MechanicKindV3]: {
    format: MechanicFormatterV3<K>;
    attributionLink: NonNullable<PresentedLogLineV3['attributionLink']>;
  };
};

export interface CombatMechanicNarrativeV3 {
  parts: PresentedLogPartV3[];
  attributionLink: NonNullable<PresentedLogLineV3['attributionLink']>;
}

const part = (
  text: string,
  kind: PresentedLogPartV3['kind'] = 'text',
  tone?: PresentedLogPartV3['tone'],
  emphasis?: PresentedLogPartV3['emphasis'],
): PresentedLogPartV3 => ({ text, kind, tone, emphasis });

const ABILITY_MODIFIER_TEXT: Record<
  Exclude<AbilityTransformModifierV3['kind'], 'cooldown'>,
  string
> = {
  true_damage: '转为真实伤害',
  dispel: '附带驱散',
  mp_cost_to_hp: '法力消耗改为气血',
  free_mana_cost: '免耗法力',
  force_critical: '必定暴击',
  stored_damage: '附加已记录伤害',
};

const RELEASE_TEXT: Record<DamageMemoryReleaseKindV3, string> = {
  damage: '伤害',
  heal: '治疗',
  shield: '护盾',
  reflect: '反伤',
  counter: '反击',
  follow_up: '追击',
};

function abilityModifierText(modifier: AbilityTransformModifierV3): string {
  if (modifier.kind !== 'cooldown') {
    return ABILITY_MODIFIER_TEXT[modifier.kind];
  }
  return modifier.rounds > 0
    ? `冷却延长 ${modifier.rounds} 回合`
    : `冷却缩短 ${Math.abs(modifier.rounds)} 回合`;
}

const DEFINITIONS: MechanicNarrativeDefinitionMapV3 = {
  ability_transform: {
    attributionLink: 'caused',
    format: (payload) => [
      part('接下来 '),
      part(String(payload.triggers), 'number', 'mechanic'),
      part(' 次符合条件的技能获得强化：'),
      part(
        payload.modifiers.map(abilityModifierText).join('、'),
        'text',
        'mechanic',
      ),
    ],
  },
  ability_lock: {
    attributionLink: 'caused',
    format: (payload) => [
      part(`封禁《${payload.abilityName}》`, 'ability', 'ability'),
      part(' '),
      part(String(payload.rounds), 'number', 'mechanic'),
      part(' 回合'),
    ],
  },
  tag_trigger: {
    attributionLink: 'context',
    format: (payload) => [part(`触发「${payload.label}」`, 'status')],
  },
  hp_sacrifice: {
    attributionLink: 'caused',
    format: (payload) => [
      part('消耗 '),
      part(String(payload.amount), 'number', 'negative'),
      part(' 点气血'),
    ],
  },
  damage_defer: {
    attributionLink: 'caused',
    format: (payload) => [
      part('将 '),
      part(String(payload.amount), 'number', 'damage'),
      part(' 点伤害延后 '),
      part(String(payload.turns), 'number', 'mechanic'),
      part(' 回合结算'),
    ],
  },
  mana_burn: {
    attributionLink: 'caused',
    format: (payload, fact) => [
      part(`燃烧「${fact.target.name}」`, 'unit'),
      part(' '),
      part(String(payload.amount), 'number', 'negative'),
      part(' 点法力'),
    ],
  },
  cooldown_change: {
    attributionLink: 'caused',
    format: (payload) => [
      part(`《${payload.abilityName}》`, 'ability', 'ability'),
      part(payload.rounds > 0 ? '冷却延长 ' : '冷却缩短 '),
      part(String(Math.abs(payload.rounds)), 'number', 'mechanic'),
      part(' 回合'),
    ],
  },
  damage_memory_record: {
    attributionLink: 'caused',
    format: (payload) => [
      part('记录 '),
      part(String(payload.amount), 'number', 'mechanic'),
      part(' 点伤害'),
    ],
  },
  damage_memory_release: {
    attributionLink: 'caused',
    format: (payload) => [
      part('释放记录，转化为 '),
      part(String(payload.amount), 'number', 'mechanic'),
      part(` 点${RELEASE_TEXT[payload.releaseAs]}`),
    ],
  },
  control_skip: {
    attributionLink: 'caused',
    format: (payload, fact) => [
      part(`「${fact.target.name}」`, 'unit'),
      part(
        `受「${payload.controlName}」影响，本回合无法行动`,
        'text',
        'control',
      ),
    ],
  },
  named_trigger: {
    attributionLink: 'context',
    format: (payload) => [part(`触发「${payload.label}」`, 'status')],
  },
  status_transition: {
    attributionLink: 'caused',
    format: (payload) => {
      switch (payload.operation) {
        case 'apply':
          return [part(`获得「${payload.label}」`, 'status')];
        case 'refresh':
          return [part(`刷新「${payload.label}」`, 'status')];
        case 'replace':
          return [
            part(
              payload.previousLabel
                ? `「${payload.previousLabel}」转为「${payload.label}」`
                : `转为「${payload.label}」`,
              'status',
            ),
          ];
        case 'consume':
          return [part(`消耗「${payload.label}」`, 'status')];
      }
    },
  },
};

/** 玩家机制文案的唯一目录。 */
export class CombatNarrativeCatalogV3 {
  importance(fact: MechanicFactV3): CombatMechanicImportanceV3 {
    return isCombatMechanicCuePayloadV3(fact.payload) ? 'cue' : 'result';
  }

  narrate(fact: MechanicFactV3): CombatMechanicNarrativeV3 {
    const definition = DEFINITIONS[fact.payload.kind];
    const formatter = definition.format as MechanicFormatterV3<
      typeof fact.payload.kind
    >;
    return {
      parts: formatter(fact.payload, fact),
      attributionLink: definition.attributionLink,
    };
  }
}
