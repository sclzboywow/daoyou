import type { SectOrganizationTheme } from '../../core';

export const YOUDU_ORGANIZATION_THEME: SectOrganizationTheme = {
  elderTrial: {
    name: '归魂婆婆·试炼化身',
    description: '携魂灯立于忘川影中，以蚀魂与镇魄逼人守住本心。',
    configVersion: 1,
    methodIds: [
      'youdu-canon',
      'three-souls-separation',
      'forgetful-river-record',
      'seven-souls-seizure',
      'soul-pinning-ironbook',
      'dead-heart-living-spirit',
    ],
    pathId: 'tide',
    tacticId: 'tide-cycle',
    abilityLoadout: [
      'soul-severing-call',
      'forgetful-river-tide',
      'pin-soul',
      'soul-shall-not-return',
    ],
    artifactNames: ['镇魂玄铁令', '忘川夜衣', '引魂灯佩'],
    artifactDescriptions: [
      '玄铁令饮下游魂余势，反哺持令之人。',
      '黑水织成夜衣，在魂魄将散时护住形神。',
      '一盏灯火照定归路，使外邪难乱三魂。',
    ],
  },
  facilityNames: {
    archive: '三魂阁',
    cultivation_room: '返照室',
    workshop: '镇铁炉',
    spirit_vein: '黑水阴脉',
    herb_garden: '返照香圃',
  },
};
