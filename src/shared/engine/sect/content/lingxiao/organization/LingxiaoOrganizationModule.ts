import {
  StandardSectOrganizationModule,
  type SectOrganizationTheme,
} from '../../../core';

/** 红尘剑宗只声明组织玩法的展示主题；核心流程由标准组织模块提供。 */
export const LINGXIAO_ORGANIZATION_THEME: SectOrganizationTheme = {
  elderTrial: {
    name: '听剑老人·试炼化身',
    description: '执一柄旧剑立于场中，只问弟子的剑为何而出。',
    configVersion: 4,
    methodIds: [
      'lingxiao-canon',
      'sword-guidance',
      'void-step',
      'edge-cleansing',
      'origin-returning',
      'sword-nurturing',
    ],
    pathId: 'swift-sword',
    tacticId: 'aggressive',
    abilityLoadout: [
      'guiding-sword',
      'linked-edge',
      'breaking-edge',
      'sect-ultimate',
    ],
    artifactNames: ['照尘古剑', '藏锋剑衣', '澄心剑珏'],
    artifactDescriptions: [
      '剑身照见尘世万象，饮敌势而养己锋。',
      '剑气藏于衣纹，危急时替主人截断死局。',
      '澄心定意，使纷乱外法难侵剑心。',
    ],
  },
};

export class LingxiaoOrganizationModule extends StandardSectOrganizationModule {
  constructor() {
    super(LINGXIAO_ORGANIZATION_THEME);
  }
}

export const LINGXIAO_ORGANIZATION = new LingxiaoOrganizationModule();
