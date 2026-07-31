import { CreationTags } from '@shared/engine/shared/tag-domain';
import type { EnemyRace, EquipmentSlot } from '@shared/types/constants';
import type { EnemyArchetypeDefinition } from './types';

const bias = (tag: string, weight: number = 0.8) => ({ tag, weight });

function slotArtifact(
  id: string,
  slot: EquipmentSlot,
  label: string,
  fallbackSuffix: string,
  dominantTags: string[],
  fallbackDescription: string,
  options: Partial<EnemyArchetypeDefinition> = {},
): EnemyArchetypeDefinition {
  return {
    id,
    productType: 'artifact',
    label,
    slot,
    elementMode: slot === 'armor' ? 'secondary' : 'primary',
    dominantTags,
    fallbackSuffix,
    fallbackDescription,
    ...options,
  };
}

export const ENEMY_ARCHETYPES: Record<
  EnemyRace,
  {
    technique: EnemyArchetypeDefinition[];
    skills: EnemyArchetypeDefinition[];
    artifacts: EnemyArchetypeDefinition[];
  }
> = {
  人族: {
    technique: [
      {
        id: 'human-technique-adapt',
        productType: 'gongfa',
        label: '机变功法',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_MANUAL,
          CreationTags.MATERIAL.SEMANTIC_SPIRIT,
          CreationTags.MATERIAL.SEMANTIC_QI,
        ],
        positiveTagBiases: [bias(CreationTags.MATERIAL.SEMANTIC_MANUAL)],
        fallbackSuffix: '应机经',
        fallbackDescription: '以推演与应变见长的人族功法。',
      },
    ],
    skills: [
      {
        id: 'human-skill-control',
        productType: 'skill',
        label: '束缚控制',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_SPIRIT,
          CreationTags.MATERIAL.SEMANTIC_ILLUSION,
        ],
        positiveTagBiases: [bias(CreationTags.MATERIAL.SEMANTIC_ILLUSION)],
        targetPolicy: { team: 'enemy', scope: 'single' },
        fallbackSuffix: '缚形印',
        fallbackDescription: '借术法封锁敌身，抢占节奏。',
      },
      {
        id: 'human-skill-barrier',
        productType: 'skill',
        label: '护身应对',
        elementMode: 'secondary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_GUARD,
          CreationTags.MATERIAL.SEMANTIC_QI,
        ],
        positiveTagBiases: [bias(CreationTags.MATERIAL.SEMANTIC_GUARD)],
        targetPolicy: { team: 'self', scope: 'single' },
        fallbackSuffix: '护身诀',
        fallbackDescription: '稳住自身灵息，为后续腾挪争取空间。',
      },
      {
        id: 'human-skill-heal',
        productType: 'skill',
        label: '回元续战',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_SUSTAIN,
          CreationTags.MATERIAL.SEMANTIC_LIFE,
          CreationTags.MATERIAL.SEMANTIC_SPIRIT,
        ],
        positiveTagBiases: [bias(CreationTags.MATERIAL.SEMANTIC_SUSTAIN)],
        targetPolicy: { team: 'self', scope: 'single' },
        fallbackSuffix: '回元术',
        fallbackDescription: '于危局中稳住法脉与气息。',
      },
      {
        id: 'human-skill-break',
        productType: 'skill',
        label: '破阵拆招',
        elementMode: 'secondary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_BURST,
          CreationTags.MATERIAL.SEMANTIC_FORMATION,
        ],
        positiveTagBiases: [bias(CreationTags.MATERIAL.SEMANTIC_FORMATION)],
        targetPolicy: { team: 'enemy', scope: 'single' },
        fallbackSuffix: '破阵术',
        fallbackDescription: '趁敌露隙强行拆解其节奏。',
      },
    ],
    artifacts: [
      slotArtifact(
        'human-artifact-weapon',
        'weapon',
        '攻伐法宝',
        '应机刃',
        [CreationTags.MATERIAL.SEMANTIC_BLADE, CreationTags.MATERIAL.SEMANTIC_BURST],
        '人族常备的攻伐法宝，讲求转圜与杀机。',
      ),
      slotArtifact(
        'human-artifact-armor',
        'armor',
        '护身法宝',
        '玄护甲',
        [CreationTags.MATERIAL.SEMANTIC_GUARD, CreationTags.MATERIAL.SEMANTIC_EARTH],
        '稳固根基的护身法宝。',
      ),
      slotArtifact(
        'human-artifact-accessory',
        'accessory',
        '辅佐法宝',
        '明识佩',
        [CreationTags.MATERIAL.SEMANTIC_SPIRIT, CreationTags.MATERIAL.SEMANTIC_QI],
        '辅助调息与临阵应变的贴身法宝.',
      ),
    ],
  },
  妖族: {
    technique: [
      {
        id: 'yao-technique-feral',
        productType: 'gongfa',
        label: '蛮骨功法',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_BEAST,
          CreationTags.MATERIAL.SEMANTIC_BLOOD,
          CreationTags.MATERIAL.SEMANTIC_BONE,
        ],
        positiveTagBiases: [bias(CreationTags.MATERIAL.SEMANTIC_BEAST)],
        fallbackSuffix: '蛮骨诀',
        fallbackDescription: '激发血脉与本体强横之力的妖族功法。',
      },
    ],
    skills: [
      {
        id: 'yao-skill-rend',
        productType: 'skill',
        label: '裂爪重击',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_BEAST,
          CreationTags.MATERIAL.SEMANTIC_BLADE,
          CreationTags.MATERIAL.SEMANTIC_BURST,
        ],
        targetPolicy: { team: 'enemy', scope: 'single' },
        fallbackSuffix: '裂爪',
        fallbackDescription: '仗本体凶横强行撕裂敌身。',
      },
      {
        id: 'yao-skill-hunt',
        productType: 'skill',
        label: '逐猎追袭',
        elementMode: 'secondary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_WIND,
          CreationTags.MATERIAL.SEMANTIC_BEAST,
        ],
        positiveTagBiases: [bias(CreationTags.MATERIAL.SEMANTIC_WIND)],
        targetPolicy: { team: 'enemy', scope: 'single' },
        fallbackSuffix: '逐猎步',
        fallbackDescription: '锁住猎物后持续压迫，不给其喘息之机。',
      },
      {
        id: 'yao-skill-regrowth',
        productType: 'skill',
        label: '返祖回生',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_SUSTAIN,
          CreationTags.MATERIAL.SEMANTIC_LIFE,
          CreationTags.MATERIAL.SEMANTIC_BLOOD,
        ],
        targetPolicy: { team: 'self', scope: 'single' },
        fallbackSuffix: '返祖息',
        fallbackDescription: '妖血回涌，快速弥合伤势。',
      },
      {
        id: 'yao-skill-bulk',
        productType: 'skill',
        label: '蛮躯护体',
        elementMode: 'secondary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_GUARD,
          CreationTags.MATERIAL.SEMANTIC_BEAST,
        ],
        targetPolicy: { team: 'self', scope: 'single' },
        fallbackSuffix: '蛮躯诀',
        fallbackDescription: '唤醒本体蛮横体魄，顶住缠斗。',
      },
    ],
    artifacts: [
      slotArtifact(
        'yao-artifact-weapon',
        'weapon',
        '猎杀号器',
        '妖骨爪',
        [CreationTags.MATERIAL.SEMANTIC_BONE, CreationTags.MATERIAL.SEMANTIC_BLADE],
        '以妖骨祭炼的攻伐法宝。',
      ),
      slotArtifact(
        'yao-artifact-armor',
        'armor',
        '蛮躯护器',
        '蛮鳞甲',
        [CreationTags.MATERIAL.SEMANTIC_GUARD, CreationTags.MATERIAL.SEMANTIC_BONE],
        '强调硬撼与续战的护身法宝。',
      ),
      slotArtifact(
        'yao-artifact-accessory',
        'accessory',
        '追猎符佩',
        '追风佩',
        [CreationTags.MATERIAL.SEMANTIC_WIND, CreationTags.MATERIAL.SEMANTIC_BEAST],
        '帮助妖族追击猎物的随身法宝。',
      ),
    ],
  },
  鬼魂: {
    technique: [
      {
        id: 'ghost-technique-soul',
        productType: 'gongfa',
        label: '幽魂功法',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_SPIRIT,
          CreationTags.MATERIAL.SEMANTIC_ILLUSION,
          CreationTags.MATERIAL.SEMANTIC_FREEZE,
        ],
        positiveTagBiases: [bias(CreationTags.MATERIAL.SEMANTIC_ILLUSION)],
        fallbackSuffix: '幽魂录',
        fallbackDescription: '绕神魂、寒煞与诡行而转的鬼修法门。',
      },
    ],
    skills: [
      {
        id: 'ghost-skill-chill',
        productType: 'skill',
        label: '阴煞侵魂',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_FREEZE,
          CreationTags.MATERIAL.SEMANTIC_SPIRIT,
        ],
        targetPolicy: { team: 'enemy', scope: 'single' },
        fallbackSuffix: '阴煞袭',
        fallbackDescription: '先侵神魂，再封敌身。',
      },
      {
        id: 'ghost-skill-bind',
        productType: 'skill',
        label: '缠魂迟滞',
        elementMode: 'secondary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_ILLUSION,
          CreationTags.MATERIAL.SEMANTIC_WIND,
        ],
        positiveTagBiases: [bias(CreationTags.MATERIAL.SEMANTIC_ILLUSION)],
        targetPolicy: { team: 'enemy', scope: 'single' },
        fallbackSuffix: '缠魂术',
        fallbackDescription: '以诡谲身法拖慢敌方节奏。',
      },
      {
        id: 'ghost-skill-shield',
        productType: 'skill',
        label: '护魄凝障',
        elementMode: 'secondary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_GUARD,
          CreationTags.MATERIAL.SEMANTIC_SPIRIT,
        ],
        targetPolicy: { team: 'self', scope: 'single' },
        fallbackSuffix: '护魄诀',
        fallbackDescription: '凝聚阴魄护身，以延长纠缠。',
      },
      {
        id: 'ghost-skill-heal',
        productType: 'skill',
        label: '聚魄回息',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_SUSTAIN,
          CreationTags.MATERIAL.SEMANTIC_SPIRIT,
        ],
        targetPolicy: { team: 'self', scope: 'single' },
        fallbackSuffix: '聚魄术',
        fallbackDescription: '以阴华回补破碎魂体。',
      },
    ],
    artifacts: [
      slotArtifact(
        'ghost-artifact-weapon',
        'weapon',
        '阴煞法宝',
        '幽魄刃',
        [CreationTags.MATERIAL.SEMANTIC_SPIRIT, CreationTags.MATERIAL.SEMANTIC_FREEZE],
        '裹挟阴煞气息的鬼修法宝。',
      ),
      slotArtifact(
        'ghost-artifact-armor',
        'armor',
        '护魄法宝',
        '冥纱衣',
        [CreationTags.MATERIAL.SEMANTIC_GUARD, CreationTags.MATERIAL.SEMANTIC_ILLUSION],
        '偏向保命与拖战的护体法宝。',
      ),
      slotArtifact(
        'ghost-artifact-accessory',
        'accessory',
        '凝魂法宝',
        '镇魂佩',
        [CreationTags.MATERIAL.SEMANTIC_ILLUSION, CreationTags.MATERIAL.SEMANTIC_SPIRIT],
        '稳住魂体、增强诡行的随身法宝.',
      ),
    ],
  },
  魔族: {
    technique: [
      {
        id: 'demon-technique-fury',
        productType: 'gongfa',
        label: '煞血功法',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_BURST,
          CreationTags.MATERIAL.SEMANTIC_BLOOD,
          CreationTags.MATERIAL.SEMANTIC_FLAME,
        ],
        positiveTagBiases: [bias(CreationTags.MATERIAL.SEMANTIC_BURST)],
        fallbackSuffix: '煞血典',
        fallbackDescription: '透支魔躯与煞气来换取爆发的法门。',
      },
    ],
    skills: [
      {
        id: 'demon-skill-burst',
        productType: 'skill',
        label: '魔焰轰杀',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_FLAME,
          CreationTags.MATERIAL.SEMANTIC_BURST,
        ],
        targetPolicy: { team: 'enemy', scope: 'single' },
        fallbackSuffix: '魔焰击',
        fallbackDescription: '以狂暴魔气和烈性术法正面轰杀。',
      },
      {
        id: 'demon-skill-execute',
        productType: 'skill',
        label: '夺命追斩',
        elementMode: 'secondary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_BLADE,
          CreationTags.MATERIAL.SEMANTIC_BURST,
        ],
        targetPolicy: { team: 'enemy', scope: 'single' },
        fallbackSuffix: '夺命术',
        fallbackDescription: '强行撕开防线，接连追击。',
      },
      {
        id: 'demon-skill-frenzy',
        productType: 'skill',
        label: '焚脉狂煞',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_BLOOD,
          CreationTags.MATERIAL.SEMANTIC_BURST,
        ],
        targetPolicy: { team: 'self', scope: 'single' },
        fallbackSuffix: '焚脉诀',
        fallbackDescription: '透支自身潜力，催出更凶猛的攻势。',
      },
      {
        id: 'demon-skill-wall',
        productType: 'skill',
        label: '镇岳魔壁',
        elementMode: 'earth',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_GUARD,
          CreationTags.MATERIAL.SEMANTIC_EARTH,
        ],
        targetPolicy: { team: 'self', scope: 'single' },
        fallbackSuffix: '魔壁印',
        fallbackDescription: '以魔气凝壁，顶住反扑。',
      },
    ],
    artifacts: [
      slotArtifact(
        'demon-artifact-weapon',
        'weapon',
        '凶煞兵器',
        '煞魂刃',
        [CreationTags.MATERIAL.SEMANTIC_BURST, CreationTags.MATERIAL.SEMANTIC_BLADE],
        '魔煞翻涌的攻伐法宝。',
      ),
      slotArtifact(
        'demon-artifact-armor',
        'armor',
        '压阵重器',
        '镇煞甲',
        [CreationTags.MATERIAL.SEMANTIC_GUARD, CreationTags.MATERIAL.SEMANTIC_EARTH],
        '强化低血死战能力的护身法宝.',
      ),
      slotArtifact(
        'demon-artifact-accessory',
        'accessory',
        '凶性饰器',
        '噬心佩',
        [CreationTags.MATERIAL.SEMANTIC_BLOOD, CreationTags.MATERIAL.SEMANTIC_SPIRIT],
        '助涨凶性与煞气的随身法宝。',
      ),
    ],
  },
  古兽: {
    technique: [
      {
        id: 'ancient-technique-primal',
        productType: 'gongfa',
        label: '太古血脉',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_BEAST,
          CreationTags.MATERIAL.SEMANTIC_BONE,
          CreationTags.MATERIAL.SEMANTIC_BURST,
        ],
        positiveTagBiases: [bias(CreationTags.MATERIAL.TYPE_SPECIAL, 1.1)],
        fallbackSuffix: '太古息',
        fallbackDescription: '唤醒太古血脉凶威的本源法门。',
        unlockBias: 18,
      },
    ],
    skills: [
      {
        id: 'ancient-skill-slam',
        productType: 'skill',
        label: '太古重击',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_BEAST,
          CreationTags.MATERIAL.SEMANTIC_BURST,
        ],
        positiveTagBiases: [bias(CreationTags.MATERIAL.TYPE_SPECIAL, 1.1)],
        targetPolicy: { team: 'enemy', scope: 'single' },
        fallbackSuffix: '重击',
        fallbackDescription: '古兽本体一击即有碾压气势。',
        unlockBias: 18,
      },
      {
        id: 'ancient-skill-pounce',
        productType: 'skill',
        label: '凶灵扑杀',
        elementMode: 'secondary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_BEAST,
          CreationTags.MATERIAL.SEMANTIC_BLADE,
        ],
        targetPolicy: { team: 'enemy', scope: 'single' },
        fallbackSuffix: '扑杀号',
        fallbackDescription: '第二轮扑杀通常更凶更沉。',
        unlockBias: 12,
      },
      {
        id: 'ancient-skill-guard',
        productType: 'skill',
        label: '蛮荒护体',
        elementMode: 'earth',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_GUARD,
          CreationTags.MATERIAL.SEMANTIC_BONE,
        ],
        targetPolicy: { team: 'self', scope: 'single' },
        fallbackSuffix: '护体术',
        fallbackDescription: '厚重躯壳足以硬扛多轮攻势。',
        unlockBias: 8,
      },
      {
        id: 'ancient-skill-recover',
        productType: 'skill',
        label: '古脉回息',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_SUSTAIN,
          CreationTags.MATERIAL.SEMANTIC_LIFE,
          CreationTags.MATERIAL.SEMANTIC_BEAST,
        ],
        targetPolicy: { team: 'self', scope: 'single' },
        fallbackSuffix: '回息术',
        fallbackDescription: '激活血脉深处的恢复本能。',
        unlockBias: 8,
      },
    ],
    artifacts: [
      slotArtifact(
        'ancient-artifact-weapon',
        'weapon',
        '太古兵刃',
        '太古刃',
        [CreationTags.MATERIAL.SEMANTIC_BURST, CreationTags.MATERIAL.SEMANTIC_BEAST],
        '承载太古凶威的重型法宝。',
        { unlockBias: 18 },
      ),
      slotArtifact(
        'ancient-artifact-armor',
        'armor',
        '太古甲器',
        '荒鳞甲',
        [CreationTags.MATERIAL.SEMANTIC_GUARD, CreationTags.MATERIAL.SEMANTIC_BONE],
        '偏向硬撼和保命的古兽护器。',
        { unlockBias: 12 },
      ),
      slotArtifact(
        'ancient-artifact-accessory',
        'accessory',
        '太古灵佩',
        '兽魂佩',
        [CreationTags.MATERIAL.SEMANTIC_SPIRIT, CreationTags.MATERIAL.SEMANTIC_BEAST],
        '凝聚太古真灵余威的贴身法宝。',
        { unlockBias: 12 },
      ),
    ],
  },
  灵族: {
    technique: [
      {
        id: 'spirit-technique-elemental',
        productType: 'gongfa',
        label: '灵源功法',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_SPIRIT,
          CreationTags.MATERIAL.SEMANTIC_QI,
          CreationTags.MATERIAL.SEMANTIC_DIVINE,
        ],
        positiveTagBiases: [bias(CreationTags.MATERIAL.SEMANTIC_SPIRIT)],
        fallbackSuffix: '灵源经',
        fallbackDescription: '引天地灵机流转周天的灵族法门。',
      },
    ],
    skills: [
      {
        id: 'spirit-skill-burst',
        productType: 'skill',
        label: '灵湮压制',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_SPIRIT,
          CreationTags.MATERIAL.SEMANTIC_BURST,
        ],
        targetPolicy: { team: 'enemy', scope: 'single' },
        fallbackSuffix: '灵湮术',
        fallbackDescription: '借通灵后的术法压制对手。',
      },
      {
        id: 'spirit-skill-barrier',
        productType: 'skill',
        label: '灵障护体',
        elementMode: 'secondary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_GUARD,
          CreationTags.MATERIAL.SEMANTIC_SPIRIT,
        ],
        targetPolicy: { team: 'self', scope: 'single' },
        fallbackSuffix: '灵障诀',
        fallbackDescription: '维持护体和回能的灵族术法。',
      },
      {
        id: 'spirit-skill-recover',
        productType: 'skill',
        label: '灵潮回春',
        elementMode: 'primary',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_SUSTAIN,
          CreationTags.MATERIAL.SEMANTIC_WATER,
          CreationTags.MATERIAL.SEMANTIC_LIFE,
        ],
        targetPolicy: { team: 'self', scope: 'single' },
        fallbackSuffix: '回春术',
        fallbackDescription: '调动灵潮迅速修补自身。',
      },
      {
        id: 'spirit-skill-wall',
        productType: 'skill',
        label: '镇灵壁',
        elementMode: 'earth',
        dominantTags: [
          CreationTags.MATERIAL.SEMANTIC_GUARD,
          CreationTags.MATERIAL.SEMANTIC_EARTH,
        ],
        targetPolicy: { team: 'self', scope: 'single' },
        fallbackSuffix: '镇灵壁',
        fallbackDescription: '唤起地脉灵息护住关键时刻。',
      },
    ],
    artifacts: [
      slotArtifact(
        'spirit-artifact-weapon',
        'weapon',
        '灵源法器',
        '灵源刃',
        [CreationTags.MATERIAL.SEMANTIC_SPIRIT, CreationTags.MATERIAL.SEMANTIC_BURST],
        '能将灵机迅速转化为攻势的法宝。',
      ),
      slotArtifact(
        'spirit-artifact-armor',
        'armor',
        '灵障护器',
        '灵障衣',
        [CreationTags.MATERIAL.SEMANTIC_GUARD, CreationTags.MATERIAL.SEMANTIC_QI],
        '偏向护体与回能的法宝。',
      ),
      slotArtifact(
        'spirit-artifact-accessory',
        'accessory',
        '通灵佩饰',
        '灵纹佩',
        [CreationTags.MATERIAL.SEMANTIC_DIVINE, CreationTags.MATERIAL.SEMANTIC_SPIRIT],
        '可与天地灵机相感的随身法宝.',
      ),
    ],
  },
};

export const ENEMY_ARCHETYPE_INDEX = new Map(
  Object.values(ENEMY_ARCHETYPES)
    .flatMap((registry) => [
      ...registry.technique,
      ...registry.skills,
      ...registry.artifacts,
    ])
    .map((archetype) => [archetype.id, archetype] as const),
);

export function getEnemyArchetype(id: string): EnemyArchetypeDefinition {
  const archetype = ENEMY_ARCHETYPE_INDEX.get(id);
  if (!archetype) {
    throw new Error(`Unknown enemy archetype: ${id}`);
  }
  return archetype;
}
