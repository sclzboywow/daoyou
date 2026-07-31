export const TOWER_BLESSING_IDS = [
  'vitality_surge',
  'spirit_surge',
  'swift_step',
  'mind_focus',
  'jade_bones',
  'sea_of_qi',
  'breathing_technique',
  'meridian_cycle',
  'balanced_dao',
] as const;

export type TowerBlessingId = (typeof TOWER_BLESSING_IDS)[number];

export interface TowerBlessingDefinition {
  id: TowerBlessingId;
  name: string;
  description: string;
  maxStacks: number;
}

export const TOWER_BLESSING_DEFINITIONS: Record<
  TowerBlessingId,
  TowerBlessingDefinition
> = {
  vitality_surge: {
    id: 'vitality_surge',
    name: '体魄澎湃',
    description: '战斗时体魄提升 8%，可叠加至 5 层。',
    maxStacks: 5,
  },
  spirit_surge: {
    id: 'spirit_surge',
    name: '灵海翻涌',
    description: '战斗时灵力提升 8%，可叠加至 5 层。',
    maxStacks: 5,
  },
  swift_step: {
    id: 'swift_step',
    name: '踏风行',
    description: '战斗时身法提升 8%，可叠加至 5 层。',
    maxStacks: 5,
  },
  mind_focus: {
    id: 'mind_focus',
    name: '明心定神',
    description: '战斗时悟性与神识各提升 6%，可叠加至 5 层。',
    maxStacks: 5,
  },
  jade_bones: {
    id: 'jade_bones',
    name: '玉骨长生',
    description: '战斗时最大气血提升 10%，可叠加至 5 层。',
    maxStacks: 5,
  },
  sea_of_qi: {
    id: 'sea_of_qi',
    name: '气海扩容',
    description: '战斗时最大法力提升 12%，可叠加至 5 层。',
    maxStacks: 5,
  },
  breathing_technique: {
    id: 'breathing_technique',
    name: '吐纳回元',
    description: '每场战斗前回复缺失气血的 10%，可叠加至 3 层。',
    maxStacks: 3,
  },
  meridian_cycle: {
    id: 'meridian_cycle',
    name: '周天流转',
    description: '每场战斗前回复缺失法力的 15%，可叠加至 3 层。',
    maxStacks: 3,
  },
  balanced_dao: {
    id: 'balanced_dao',
    name: '大道均衡',
    description: '战斗时五维主属性同步提升 5%，可叠加至 3 层。',
    maxStacks: 3,
  },
};

export function getTowerBlessingDefinition(id: TowerBlessingId) {
  return TOWER_BLESSING_DEFINITIONS[id];
}
