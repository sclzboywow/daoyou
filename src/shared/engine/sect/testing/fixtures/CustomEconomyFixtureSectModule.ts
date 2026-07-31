import {
  BaseSectModule,
  StandardSectCapabilityPolicy,
  standardSectMethodGrowthPolicy,
  standardSectProgression,
  type SectBuildBuilder,
  type SectDefinition,
  type SectDefinitionWithoutPaths,
  type SectOrganizationModule,
  type SectProjectionContext,
} from '../../core';
import { FIXTURE_SECT_MODULE } from './FixtureSectModule';

const fixtureTaskDialogue = {
  offeredReply: '这趟巡山交给我',
  activeReply: '巡山的安排，请再说一遍',
  claimableReply: '巡山已经完成，请查验',
  claimedReply: '请替我查查巡山记录',
  instruction: { text: '沿山路巡视一周，确认无事后回来复命。' },
};

const fixtureOrganization: SectOrganizationModule = {
  capabilities: new StandardSectCapabilityPolicy({
    'sect.hall.view': 'registered',
    'sect.tasks.use': 'registered',
    'sect.archive.use': 'registered',
    'sect.enlightenment.use': 'registered',
    'sect.arena.use': 'registered',
    'sect.shop.use': 'registered',
    'sect.construction.view': 'registered',
    'sect.construction.donate': 'registered',
    'sect.facility.cultivation.use': 'outer',
    'sect.facility.alchemy.use': 'inner',
    'sect.facility.refinery.use': 'inner',
    'sect.spirit_vein.view': 'registered',
    'sect.herb_garden.view': 'registered',
    'sect.cave.view': 'inner',
    'sect.gate.view': 'registered',
    'sect.formation.view': 'true',
  }),
  ranks: {
    nextRank: (rank) =>
      (
        ({
          registered: 'outer',
          outer: 'inner',
          inner: 'true',
          true: null,
        }) as const
      )[rank],
    methodLevelCap: () => 7,
    requirement: (rank) => ({
      rank,
      minRealm: rank === 'true' ? '金丹' : rank === 'inner' ? '筑基' : '炼气',
      contribution: rank === 'true' ? 30 : rank === 'inner' ? 20 : 10,
    }),
  },
  tasks: {
    listDaily: () => [
      {
        id: 'fixture_patrol',
        kind: 'daily',
        enrollment: 'manual',
        requiredCapability: 'sect.tasks.use',
        executorKey: 'fixture-sect.battle',
        reward: {
          policy: 'sect.reward.realm-task',
          input: { baseContribution: 3 },
        },
        fulfillment: [],
        presentation: {
          title: '夹具巡山',
          description: '仅用于验证内容模块替换。',
          actionLabel: '开始巡山',
          dialogue: fixtureTaskDialogue,
        },
        target: 1,
      },
    ],
    listWeekly: () => [],
    listPromotion: () => [],
    get: (id) =>
      id === 'fixture_patrol'
        ? {
            id,
            kind: 'daily',
            enrollment: 'manual',
            requiredCapability: 'sect.tasks.use',
            executorKey: 'fixture-sect.battle',
            reward: {
              policy: 'sect.reward.realm-task',
              input: { baseContribution: 3 },
            },
            fulfillment: [],
            presentation: {
              title: '夹具巡山',
              description: '仅用于验证内容模块替换。',
              actionLabel: '开始巡山',
              dialogue: fixtureTaskDialogue,
            },
            target: 1,
          }
        : undefined,
    listByCompletionTag: () => [],
  },
  economy: {
    stipendBase: () => 1,
  },
  construction: {
    facilities: [
      {
        key: 'fixture_observatory',
        initialLevel: 1,
        maxLevel: 3,
        upgradeable: true,
      },
    ],
    upgradeTarget: (level) => (level < 3 ? 1 : null),
  },
  battles: { get: () => undefined },
  benefits: {
    snapshot: () => ({
      retreatMultiplier: 1,
      craftDiscounts: {
        'sect.craft.alchemy': 0,
        'sect.craft.refinery': 0,
      },
      facilityEffects: {},
    }),
    archiveLevel: (levels) => levels.get('fixture_observatory') ?? 1,
    methodLevelCap: () => 7,
    retreatMultiplier: () => 1,
    craftDiscount: () => ({
      capability: 'sect.facility.alchemy.use',
      discount: 0,
    }),
    stipendMultiplier: () => 1,
  },
};

function omitPaths(definition: SectDefinition): SectDefinitionWithoutPaths {
  const { paths, ...withoutPaths } = definition;
  void paths;
  return withoutPaths;
}

const fixtureDefinition = omitPaths(FIXTURE_SECT_MODULE.definition);

class CustomEconomyFixtureSectModule extends BaseSectModule {
  constructor() {
    super(
      fixtureDefinition,
      Array.from(FIXTURE_SECT_MODULE.paths.values()),
      standardSectProgression,
      standardSectMethodGrowthPolicy,
      fixtureOrganization,
      {
        check: (context) => FIXTURE_SECT_MODULE.checkAdmission(context),
      },
    );
  }

  protected compileBase(
    context: SectProjectionContext,
    builder: SectBuildBuilder,
  ): void {
    const build = FIXTURE_SECT_MODULE.createBaseBuilder(context).build();
    builder.replaceAbilities(build.abilities);
    for (const resource of build.resources) builder.setResource(resource);
    for (const modifier of build.abilityPresentationModifiers ?? []) {
      builder.addAbilityPresentationModifier(modifier);
    }
  }

  createBaseSelectionStrategy() {
    return FIXTURE_SECT_MODULE.createBaseSelectionStrategy();
  }
}

/** 仅供验证自定义经济/服务端插件；标准宗门扩展测试不得使用。 */
export const CUSTOM_ECONOMY_FIXTURE_SECT_MODULE =
  new CustomEconomyFixtureSectModule();
