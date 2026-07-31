import type { EnemyRace, EquipmentSlot } from '@shared/types/constants';
import type {
  EnemyArtifactRole,
  EnemyPersonaArtifactPlan,
  EnemyPersonaDefinition,
  EnemyPersonaSkillPlan,
  EnemyPersonaTechniquePlan,
  EnemySkillRole,
} from './types';

function technique(
  archetypeIds: string[],
  narrativeTags: string[],
  tagOverlays: string[] = [],
): EnemyPersonaTechniquePlan {
  return {
    role: 'technique',
    archetypeIds,
    narrativeTags,
    tagOverlays,
  };
}

function skill(
  role: EnemySkillRole,
  archetypeIds: string[],
  narrativeTags: string[],
  tagOverlays: string[] = [],
): EnemyPersonaSkillPlan {
  return {
    role,
    archetypeIds,
    narrativeTags,
    tagOverlays,
  };
}

function artifact(
  slot: EquipmentSlot,
  role: EnemyArtifactRole,
  archetypeIds: string[],
  narrativeTags: string[],
  tagOverlays: string[] = [],
): EnemyPersonaArtifactPlan {
  return {
    slot,
    role,
    archetypeIds,
    narrativeTags,
    tagOverlays,
  };
}

export const ENEMY_PERSONAS: Record<EnemyRace, EnemyPersonaDefinition[]> = {
  人族: [
    {
      id: 'human-strategist',
      label: '机变策士',
      narrativeTags: ['推演', '拆招'],
      technique: technique(['human-technique-adapt'], ['运筹'], ['机变']),
      skills: [
        skill('control', ['human-skill-control', 'human-skill-break'], ['控场'], ['幻术']),
        skill('offense', ['human-skill-break', 'human-skill-control'], ['破势'], ['阵解']),
        skill('guard', ['human-skill-barrier', 'human-skill-heal'], ['护体'], ['御气']),
        skill('sustain', ['human-skill-heal', 'human-skill-barrier'], ['续战'], ['回元']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['human-artifact-weapon'], ['破招'], ['锋锐']),
        armor: artifact('armor', 'armor', ['human-artifact-armor'], ['稳守'], ['护身']),
        accessory: artifact('accessory', 'accessory', ['human-artifact-accessory'], ['洞察'], ['阵识']),
      },
      accentSkillRole: 'offense',
      accentArtifactSlot: 'accessory',
    },
    {
      id: 'human-guardian',
      label: '守正修士',
      narrativeTags: ['稳守', '回元'],
      technique: technique(['human-technique-adapt'], ['守正'], ['平衡']),
      skills: [
        skill('guard', ['human-skill-barrier', 'human-skill-heal'], ['护身'], ['御气']),
        skill('sustain', ['human-skill-heal', 'human-skill-barrier'], ['回元'], ['调息']),
        skill('control', ['human-skill-control', 'human-skill-break'], ['控场'], ['封锁']),
        skill('offense', ['human-skill-break', 'human-skill-control'], ['拆招'], ['反制']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['human-artifact-weapon'], ['反制'], ['机锋']),
        armor: artifact('armor', 'armor', ['human-artifact-armor'], ['坚守'], ['护体']),
        accessory: artifact('accessory', 'accessory', ['human-artifact-accessory'], ['调息'], ['灵识']),
      },
      accentSkillRole: 'control',
      accentArtifactSlot: 'armor',
    },
    {
      id: 'human-duelist',
      label: '破阵斗修',
      narrativeTags: ['抢节奏', '破阵'],
      technique: technique(['human-technique-adapt'], ['斗战'], ['应变']),
      skills: [
        skill('offense', ['human-skill-break', 'human-skill-control'], ['破阵'], ['攻伐']),
        skill('control', ['human-skill-control', 'human-skill-break'], ['束敌'], ['夺势']),
        skill('guard', ['human-skill-barrier', 'human-skill-heal'], ['护体'], ['换气']),
        skill('sustain', ['human-skill-heal', 'human-skill-barrier'], ['续力'], ['调元']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['human-artifact-weapon'], ['突袭'], ['刃势']),
        armor: artifact('armor', 'armor', ['human-artifact-armor'], ['稳身'], ['地脉']),
        accessory: artifact('accessory', 'accessory', ['human-artifact-accessory'], ['应机'], ['明识']),
      },
      accentSkillRole: 'guard',
      accentArtifactSlot: 'weapon',
    },
  ],
  妖族: [
    {
      id: 'yao-hunter',
      label: '逐猎妖修',
      narrativeTags: ['追猎', '撕裂'],
      technique: technique(['yao-technique-feral'], ['妖血'], ['兽性']),
      skills: [
        skill('offense', ['yao-skill-rend', 'yao-skill-hunt'], ['撕裂'], ['流血']),
        skill('control', ['yao-skill-hunt', 'yao-skill-rend'], ['缠斗'], ['扑杀']),
        skill('guard', ['yao-skill-bulk', 'yao-skill-regrowth'], ['蛮躯'], ['硬撼']),
        skill('sustain', ['yao-skill-regrowth', 'yao-skill-bulk'], ['返祖'], ['续命']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['yao-artifact-weapon'], ['猎杀'], ['妖骨']),
        armor: artifact('armor', 'armor', ['yao-artifact-armor'], ['硬撼'], ['鳞甲']),
        accessory: artifact('accessory', 'accessory', ['yao-artifact-accessory'], ['追风'], ['锁敌']),
      },
      accentSkillRole: 'control',
      accentArtifactSlot: 'weapon',
    },
    {
      id: 'yao-bruiser',
      label: '蛮躯妖修',
      narrativeTags: ['硬撼', '续战'],
      technique: technique(['yao-technique-feral'], ['蛮骨'], ['血脉']),
      skills: [
        skill('guard', ['yao-skill-bulk', 'yao-skill-regrowth'], ['蛮躯'], ['坚韧']),
        skill('sustain', ['yao-skill-regrowth', 'yao-skill-bulk'], ['血涌'], ['回生']),
        skill('offense', ['yao-skill-rend', 'yao-skill-hunt'], ['裂伤'], ['扑击']),
        skill('control', ['yao-skill-hunt', 'yao-skill-rend'], ['追袭'], ['压迫']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['yao-artifact-weapon'], ['撕杀'], ['骨刃']),
        armor: artifact('armor', 'armor', ['yao-artifact-armor'], ['抗打'], ['鳞护']),
        accessory: artifact('accessory', 'accessory', ['yao-artifact-accessory'], ['追袭'], ['风感']),
      },
      accentSkillRole: 'offense',
      accentArtifactSlot: 'armor',
    },
    {
      id: 'yao-ambusher',
      label: '伏袭妖修',
      narrativeTags: ['突袭', '压迫'],
      technique: technique(['yao-technique-feral'], ['野性'], ['潜袭']),
      skills: [
        skill('control', ['yao-skill-hunt', 'yao-skill-rend'], ['逐杀'], ['缠斗']),
        skill('offense', ['yao-skill-rend', 'yao-skill-hunt'], ['扑杀'], ['撕裂']),
        skill('sustain', ['yao-skill-regrowth', 'yao-skill-bulk'], ['妖血'], ['回涌']),
        skill('guard', ['yao-skill-bulk', 'yao-skill-regrowth'], ['抗衡'], ['护体']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['yao-artifact-weapon'], ['扑杀'], ['利爪']),
        armor: artifact('armor', 'armor', ['yao-artifact-armor'], ['承伤'], ['蛮鳞']),
        accessory: artifact('accessory', 'accessory', ['yao-artifact-accessory'], ['逐风'], ['猎息']),
      },
      accentSkillRole: 'sustain',
      accentArtifactSlot: 'accessory',
    },
  ],
  鬼魂: [
    {
      id: 'ghost-haunter',
      label: '阴缠幽魂',
      narrativeTags: ['迟滞', '侵魂'],
      technique: technique(['ghost-technique-soul'], ['阴华'], ['神魂']),
      skills: [
        skill('control', ['ghost-skill-bind', 'ghost-skill-chill'], ['缠魂'], ['减益']),
        skill('offense', ['ghost-skill-chill', 'ghost-skill-bind'], ['侵魂'], ['阴煞']),
        skill('guard', ['ghost-skill-shield', 'ghost-skill-heal'], ['护魄'], ['阴障']),
        skill('sustain', ['ghost-skill-heal', 'ghost-skill-shield'], ['聚魄'], ['回息']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['ghost-artifact-weapon'], ['阴煞'], ['寒锋']),
        armor: artifact('armor', 'armor', ['ghost-artifact-armor'], ['护魄'], ['冥纱']),
        accessory: artifact('accessory', 'accessory', ['ghost-artifact-accessory'], ['镇魂'], ['凝魄']),
      },
      accentSkillRole: 'offense',
      accentArtifactSlot: 'accessory',
    },
    {
      id: 'ghost-warden',
      label: '守魄阴灵',
      narrativeTags: ['护魄', '拖战'],
      technique: technique(['ghost-technique-soul'], ['冥守'], ['阴寒']),
      skills: [
        skill('guard', ['ghost-skill-shield', 'ghost-skill-heal'], ['护魄'], ['阴障']),
        skill('sustain', ['ghost-skill-heal', 'ghost-skill-shield'], ['回魄'], ['修补']),
        skill('control', ['ghost-skill-bind', 'ghost-skill-chill'], ['迟滞'], ['锁魂']),
        skill('offense', ['ghost-skill-chill', 'ghost-skill-bind'], ['寒袭'], ['侵蚀']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['ghost-artifact-weapon'], ['寒锋'], ['阴煞']),
        armor: artifact('armor', 'armor', ['ghost-artifact-armor'], ['冥纱'], ['缓冲']),
        accessory: artifact('accessory', 'accessory', ['ghost-artifact-accessory'], ['凝魂'], ['守魄']),
      },
      accentSkillRole: 'control',
      accentArtifactSlot: 'armor',
    },
    {
      id: 'ghost-reaver',
      label: '夺魄阴修',
      narrativeTags: ['阴袭', '削势'],
      technique: technique(['ghost-technique-soul'], ['夺魄'], ['幽行']),
      skills: [
        skill('offense', ['ghost-skill-chill', 'ghost-skill-bind'], ['侵魂'], ['冻杀']),
        skill('control', ['ghost-skill-bind', 'ghost-skill-chill'], ['缠魂'], ['迟滞']),
        skill('guard', ['ghost-skill-shield', 'ghost-skill-heal'], ['阴障'], ['护魄']),
        skill('sustain', ['ghost-skill-heal', 'ghost-skill-shield'], ['续魄'], ['归魂']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['ghost-artifact-weapon'], ['冥刃'], ['魂寒']),
        armor: artifact('armor', 'armor', ['ghost-artifact-armor'], ['冥衣'], ['缠战']),
        accessory: artifact('accessory', 'accessory', ['ghost-artifact-accessory'], ['拘魂'], ['灵压']),
      },
      accentSkillRole: 'guard',
      accentArtifactSlot: 'weapon',
    },
  ],
  魔族: [
    {
      id: 'demon-executioner',
      label: '魔焰刽子',
      narrativeTags: ['爆发', '斩杀'],
      technique: technique(['demon-technique-fury'], ['煞气'], ['透支']),
      skills: [
        skill('offense', ['demon-skill-burst', 'demon-skill-execute'], ['爆轰'], ['魔焰']),
        skill('control', ['demon-skill-execute', 'demon-skill-wall'], ['压制'], ['断命']),
        skill('guard', ['demon-skill-wall', 'demon-skill-frenzy'], ['魔壁'], ['抗衡']),
        skill('sustain', ['demon-skill-frenzy', 'demon-skill-wall'], ['狂性'], ['续战']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['demon-artifact-weapon'], ['轰杀'], ['煞兵']),
        armor: artifact('armor', 'armor', ['demon-artifact-armor'], ['硬扛'], ['魔甲']),
        accessory: artifact('accessory', 'accessory', ['demon-artifact-accessory'], ['残暴'], ['燃魂']),
      },
      accentSkillRole: 'guard',
      accentArtifactSlot: 'weapon',
    },
    {
      id: 'demon-berserker',
      label: '狂战魔修',
      narrativeTags: ['低血狂战', '硬拼'],
      technique: technique(['demon-technique-fury'], ['狂煞'], ['拼命']),
      skills: [
        skill('sustain', ['demon-skill-frenzy', 'demon-skill-wall'], ['燃脉'], ['续命']),
        skill('offense', ['demon-skill-burst', 'demon-skill-execute'], ['暴烈'], ['追命']),
        skill('guard', ['demon-skill-wall', 'demon-skill-frenzy'], ['魔壁'], ['顶压']),
        skill('control', ['demon-skill-execute', 'demon-skill-wall'], ['逼杀'], ['封路']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['demon-artifact-weapon'], ['噬血'], ['重斩']),
        armor: artifact('armor', 'armor', ['demon-artifact-armor'], ['硬抗'], ['血甲']),
        accessory: artifact('accessory', 'accessory', ['demon-artifact-accessory'], ['狂性'], ['凶意']),
      },
      accentSkillRole: 'offense',
      accentArtifactSlot: 'armor',
    },
    {
      id: 'demon-overlord',
      label: '镇狱魔修',
      narrativeTags: ['威压', '压场'],
      technique: technique(['demon-technique-fury'], ['魔威'], ['统御']),
      skills: [
        skill('guard', ['demon-skill-wall', 'demon-skill-frenzy'], ['镇压'], ['壁障']),
        skill('offense', ['demon-skill-burst', 'demon-skill-execute'], ['轰灭'], ['魔焰']),
        skill('control', ['demon-skill-execute', 'demon-skill-wall'], ['逼退'], ['压场']),
        skill('sustain', ['demon-skill-frenzy', 'demon-skill-wall'], ['噬元'], ['回煞']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['demon-artifact-weapon'], ['魔兵'], ['威压']),
        armor: artifact('armor', 'armor', ['demon-artifact-armor'], ['镇躯'], ['硬守']),
        accessory: artifact('accessory', 'accessory', ['demon-artifact-accessory'], ['摄魂'], ['煞念']),
      },
      accentSkillRole: 'control',
      accentArtifactSlot: 'accessory',
    },
  ],
  古兽: [
    {
      id: 'ancient-crusher',
      label: '太古碾杀号',
      narrativeTags: ['碾压', '重击'],
      technique: technique(['ancient-technique-primal'], ['太古'], ['凶威']),
      skills: [
        skill('offense', ['ancient-skill-slam', 'ancient-skill-pounce'], ['重击'], ['扑杀']),
        skill('control', ['ancient-skill-pounce', 'ancient-skill-slam'], ['压制'], ['扑袭']),
        skill('guard', ['ancient-skill-guard', 'ancient-skill-recover'], ['厚躯'], ['硬撼']),
        skill('sustain', ['ancient-skill-recover', 'ancient-skill-guard'], ['回息'], ['血脉']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['ancient-artifact-weapon'], ['凶兵'], ['骨威']),
        armor: artifact('armor', 'armor', ['ancient-artifact-armor'], ['重甲'], ['护躯']),
        accessory: artifact('accessory', 'accessory', ['ancient-artifact-accessory'], ['太古'], ['威压']),
      },
      accentSkillRole: 'guard',
      accentArtifactSlot: 'weapon',
    },
    {
      id: 'ancient-colossus',
      label: '太古镇岳兽',
      narrativeTags: ['硬扛', '守势'],
      technique: technique(['ancient-technique-primal'], ['厚重'], ['原始']),
      skills: [
        skill('guard', ['ancient-skill-guard', 'ancient-skill-recover'], ['护体'], ['镇场']),
        skill('sustain', ['ancient-skill-recover', 'ancient-skill-guard'], ['回息'], ['复原']),
        skill('offense', ['ancient-skill-slam', 'ancient-skill-pounce'], ['震碎'], ['轰踏']),
        skill('control', ['ancient-skill-pounce', 'ancient-skill-slam'], ['扑压'], ['逼位']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['ancient-artifact-weapon'], ['沉击'], ['骨爪']),
        armor: artifact('armor', 'armor', ['ancient-artifact-armor'], ['重壳'], ['磐护']),
        accessory: artifact('accessory', 'accessory', ['ancient-artifact-accessory'], ['古威'], ['灵压']),
      },
      accentSkillRole: 'offense',
      accentArtifactSlot: 'armor',
    },
    {
      id: 'ancient-stormbeast',
      label: '太古疾掠兽',
      narrativeTags: ['扑杀号', '连压'],
      technique: technique(['ancient-technique-primal'], ['凶暴'], ['掠杀']),
      skills: [
        skill('control', ['ancient-skill-pounce', 'ancient-skill-slam'], ['扑袭'], ['抢势']),
        skill('offense', ['ancient-skill-slam', 'ancient-skill-pounce'], ['震杀'], ['撕扑']),
        skill('guard', ['ancient-skill-guard', 'ancient-skill-recover'], ['抗衡'], ['顶压']),
        skill('sustain', ['ancient-skill-recover', 'ancient-skill-guard'], ['复元'], ['回血']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['ancient-artifact-weapon'], ['撕裂'], ['古锋']),
        armor: artifact('armor', 'armor', ['ancient-artifact-armor'], ['韧性'], ['厚鳞']),
        accessory: artifact('accessory', 'accessory', ['ancient-artifact-accessory'], ['凶念'], ['古灵']),
      },
      accentSkillRole: 'sustain',
      accentArtifactSlot: 'accessory',
    },
  ],
  灵族: [
    {
      id: 'spirit-arcanist',
      label: '通灵术士',
      narrativeTags: ['元素', '术压'],
      technique: technique(['spirit-technique-elemental'], ['灵机'], ['元素']),
      skills: [
        skill('offense', ['spirit-skill-burst', 'spirit-skill-wall'], ['灵湮'], ['法潮']),
        skill('guard', ['spirit-skill-barrier', 'spirit-skill-wall'], ['灵障'], ['护体']),
        skill('sustain', ['spirit-skill-recover', 'spirit-skill-barrier'], ['回能'], ['回春']),
        skill('control', ['spirit-skill-wall', 'spirit-skill-burst'], ['镇压'], ['场域']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['spirit-artifact-weapon'], ['灵爆'], ['灵刃']),
        armor: artifact('armor', 'armor', ['spirit-artifact-armor'], ['灵障'], ['护流']),
        accessory: artifact('accessory', 'accessory', ['spirit-artifact-accessory'], ['通灵'], ['引机']),
      },
      accentSkillRole: 'control',
      accentArtifactSlot: 'accessory',
    },
    {
      id: 'spirit-guardian',
      label: '灵障守御',
      narrativeTags: ['护体', '回能'],
      technique: technique(['spirit-technique-elemental'], ['周流'], ['灵障']),
      skills: [
        skill('guard', ['spirit-skill-barrier', 'spirit-skill-wall'], ['护体'], ['结界']),
        skill('sustain', ['spirit-skill-recover', 'spirit-skill-barrier'], ['回潮'], ['回能']),
        skill('offense', ['spirit-skill-burst', 'spirit-skill-wall'], ['灵爆'], ['术压']),
        skill('control', ['spirit-skill-wall', 'spirit-skill-burst'], ['镇场'], ['压流']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['spirit-artifact-weapon'], ['灵锋'], ['骤发']),
        armor: artifact('armor', 'armor', ['spirit-artifact-armor'], ['灵障'], ['流护']),
        accessory: artifact('accessory', 'accessory', ['spirit-artifact-accessory'], ['导灵'], ['养机']),
      },
      accentSkillRole: 'offense',
      accentArtifactSlot: 'armor',
    },
    {
      id: 'spirit-conduit',
      label: '灵潮引渡',
      narrativeTags: ['灵潮', '场域'],
      technique: technique(['spirit-technique-elemental'], ['潮汐'], ['通灵']),
      skills: [
        skill('control', ['spirit-skill-wall', 'spirit-skill-burst'], ['场域'], ['镇灵']),
        skill('offense', ['spirit-skill-burst', 'spirit-skill-wall'], ['压制'], ['灵湮']),
        skill('guard', ['spirit-skill-barrier', 'spirit-skill-wall'], ['护潮'], ['灵障']),
        skill('sustain', ['spirit-skill-recover', 'spirit-skill-barrier'], ['回流'], ['调机']),
      ],
      artifacts: {
        weapon: artifact('weapon', 'weapon', ['spirit-artifact-weapon'], ['骤潮'], ['灵刃']),
        armor: artifact('armor', 'armor', ['spirit-artifact-armor'], ['御流'], ['灵衣']),
        accessory: artifact('accessory', 'accessory', ['spirit-artifact-accessory'], ['引潮'], ['通灵']),
      },
      accentSkillRole: 'sustain',
      accentArtifactSlot: 'weapon',
    },
  ],
};

export function getEnemyPersonas(race: EnemyRace): EnemyPersonaDefinition[] {
  return ENEMY_PERSONAS[race];
}
