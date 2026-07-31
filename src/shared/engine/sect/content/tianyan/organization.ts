import type { SectOrganizationTheme } from '../../core';

export const TIANYAN_ORGANIZATION_THEME: SectOrganizationTheme = {
  elderTrial: {
    name: '观澜真人·试炼化身',
    description: '以河洛法印推演战局，步步逼问弟子的下一着。',
    configVersion: 1,
    methodIds: [
      'tianyan-canon',
      'wood-vitality',
      'fire-illumination',
      'earth-bearing',
      'metal-severing',
      'water-flowing',
    ],
    pathId: 'hetu-evolution',
    tacticId: 'small-cycle',
    abilityLoadout: [
      'verdant-pulse',
      'flowing-flame',
      'dark-water-return',
      'shift-palace',
    ],
    artifactNames: ['太白演星尺', '坤舆法袍', '河洛定盘'],
    artifactDescriptions: [
      '星纹沿尺身流转，攻守变化皆可归入推演。',
      '厚土阵纹承接来势，在死局前留下一线生机。',
      '河洛刻度定住心神，使外邪难乱推演。',
    ],
  },
  facilityNames: {
    archive: '五经阁',
    cultivation_room: '太初静室',
    workshop: '太白铸府',
  },
};
