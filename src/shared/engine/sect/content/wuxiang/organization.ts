import type { SectOrganizationTheme } from '../../core';

export const WUXIANG_ORGANIZATION_THEME: SectOrganizationTheme = {
  elderTrial: {
    name: '空慈方丈·试炼化身',
    description: '佛魔二相同现，以色身与业火检验来者道心。',
    configVersion: 2,
    methodIds: [
      'wuxiang-canon',
      'blood-lotus',
      'white-bone',
      'wrathful-ming',
      'six-senses',
      'reed-crossing-method',
    ],
    pathId: 'mirror-karma',
    tacticId: 'guard',
    abilityLoadout: [
      'turn-form',
      'blood-tide',
      'three-knocks',
      'observe-calamity',
    ],
    artifactNames: ['降魔金刚杵', '白骨莲衣', '明镜心珠'],
    artifactDescriptions: [
      '金刚杵饮下敌势，以佛魔二力反照来处。',
      '白骨与血莲交织成衣，危急时护住色身。',
      '明镜照业，令侵入心识的诸相无所遁形。',
    ],
  },
  facilityNames: {
    archive: '贝叶藏',
    cultivation_room: '止观室',
    workshop: '火供院',
  },
};
