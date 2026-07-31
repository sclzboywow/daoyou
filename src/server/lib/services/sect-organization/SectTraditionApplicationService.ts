import { getRealmStageRank } from '@shared/config/realmProgression';
import type { ResourceChangeDescriptor } from '@shared/contracts/resources';
import {
  AbilityLoadoutSpecification,
  getEffectiveSectMethodLevelCap,
  MeridianLoadoutSpecification,
  MethodTrainingSpecification,
  SectTradition,
  StandardSectRules,
  type CultivatorSectState,
  type SectPathDefinition,
  type SectRuntime,
  type SectTrainingCost,
} from '@shared/engine/sect';
import { SectError } from '../SectError';
import type {
  SectTraditionRepository,
  SectTrainingResourceGateway,
  SectTrainingResourceSnapshot,
} from './ports';
import { SectCapabilityAuthorizer } from './SectCapabilityAuthorizer';

/** Tradition use cases. All ports are transaction-bound by the composition root. */
export class SectTraditionApplicationService {
  private readonly methodTraining = new MethodTrainingSpecification();
  private readonly meridianLoadout = new MeridianLoadoutSpecification();
  private readonly abilityLoadout = new AbilityLoadoutSpecification();

  constructor(
    readonly runtime: SectRuntime,
    private readonly repository: SectTraditionRepository,
    private readonly resources: SectTrainingResourceGateway,
    private readonly authorizer = new SectCapabilityAuthorizer(),
  ) {}

  getState(cultivatorId: string) {
    return this.repository.load(cultivatorId);
  }

  getStateForSect(cultivatorId: string, sectId: string) {
    if (!this.runtime.registry.get(sectId))
      throw new SectError('SECT_UNKNOWN', '未知宗门', 400);
    return this.repository.loadForSect(cultivatorId, sectId);
  }

  async trainMethod(args: {
    cultivatorId: string;
    methodId: string;
    targetLevel: number;
  }) {
    const sect = await this.requireActive(args.cultivatorId);
    const module = this.runtime.registry.require(sect.sectId);
    this.authorizer.assertOrganization(
      module.organization,
      sect.discipleRank ?? 'registered',
      'sect.archive.use',
    );
    const cultivator = await this.requireProgress(args.cultivatorId);
    const currentLevel = sect.methods[args.methodId] ?? 0;
    try {
      this.methodTraining.assert({
        definition: module.definition,
        methodId: args.methodId,
        currentLevel,
        targetLevel: args.targetLevel,
        levelCap: getEffectiveSectMethodLevelCap({
          realmCap: module.progression.methodLevelCap(
            cultivator.realm,
            cultivator.stage,
          ),
          rank: sect.discipleRank ?? 'registered',
          facilityCap: await this.resources.methodLevelCap(args.cultivatorId),
          rankCap: module.organization.ranks.methodLevelCap(
            sect.discipleRank ?? 'registered',
          ),
        }),
        methods: sect.methods,
      });
    } catch (error) {
      throw new SectError(
        'SECT_METHOD_CAP',
        error instanceof Error ? error.message : '心法等级受限',
        400,
      );
    }
    const cost = module.progression.methodTrainingCost(
      currentLevel,
      args.targetLevel,
    );
    const balances = await this.payTrainingCost(
      cultivator,
      args.cultivatorId,
      cost,
    );
    const aggregate = SectTradition.rehydrate(sect);
    aggregate.setMethodLevel(args.methodId, args.targetLevel);
    await this.repository.setMethodLevel(
      sect.membershipId,
      args.methodId,
      args.targetLevel,
    );
    return {
      sect: await this.requireActive(args.cultivatorId),
      methodId: args.methodId,
      targetLevel: args.targetLevel,
      cost,
      balances,
    };
  }

  async unlockPathLayer(args: {
    cultivatorId: string;
    pathId: string;
    layerId: string;
  }) {
    const sect = await this.requireActive(args.cultivatorId);
    const module = this.runtime.registry.require(sect.sectId);
    this.assertEnlightenment(module.organization, sect);
    const path = module.definition.paths.find(
      (entry) => entry.id === args.pathId,
    );
    if (!path) throw new SectError('SECT_PATH_UNKNOWN', '未知流派', 400);
    const pathState = sect.paths.find((entry) => entry.pathId === args.pathId);
    const cultivator = await this.requireProgress(args.cultivatorId);
    this.assertPathRealm(cultivator, path);
    let layer;
    try {
      layer = module.progression.assertPathLayerUnlock({
        path,
        unlockedLayerIds: pathState?.unlockedLayerIds ?? [],
        layerId: args.layerId,
        realm: cultivator.realm,
        stage: cultivator.stage,
        methods: sect.methods,
      });
    } catch (error) {
      throw new SectError(
        'SECT_REALM_GATE',
        error instanceof Error ? error.message : '流派层级受限',
        400,
      );
    }
    const balances = await this.payTrainingCost(
      cultivator,
      args.cultivatorId,
      layer.cost,
    );
    const aggregate = SectTradition.rehydrate(sect);
    aggregate.unlockPathLayer(args.pathId, layer.id, path.defaultTacticId);
    if (pathState) {
      if (
        !(await this.repository.appendUnlockedPathLayer(
          sect.membershipId,
          args.pathId,
          layer.id,
          pathState.unlockedLayerIds.length,
        ))
      )
        throw new SectError('SECT_REALM_GATE', '流派层级状态已变化，请重试');
    } else {
      if (
        !(await this.repository.createPathWithFirstLayer(
          sect.membershipId,
          args.pathId,
          path.defaultTacticId,
          layer.id,
        ))
      )
        throw new SectError('SECT_REALM_GATE', '流派已经习得，请重试');
      await this.repository.activatePathIfNone(sect.membershipId, args.pathId);
    }
    return {
      sect: await this.requireActive(args.cultivatorId),
      pathId: args.pathId,
      layerId: layer.id,
      cost: layer.cost,
      balances,
    };
  }

  async activatePath(cultivatorId: string, pathId: string) {
    const { sect } = await this.requirePath(cultivatorId, pathId);
    SectTradition.rehydrate(sect).activatePath(pathId);
    if (!(await this.repository.activatePath(sect.membershipId, pathId)))
      throw new SectError('SECT_PATH_NOT_LEARNED', '尚未习得该流派');
    return this.requireActive(cultivatorId);
  }

  async setMeridianLoadout(
    cultivatorId: string,
    pathId: string,
    slot: number,
    nodeIds: string[],
  ) {
    const normalizedSlot = this.requireEnabledSlot(slot);
    const { sect, path, pathState } = await this.requirePath(
      cultivatorId,
      pathId,
    );
    let validated: string[];
    try {
      validated = this.meridianLoadout.validateUpdate({
        path,
        currentNodeIds:
          pathState.meridianLoadouts.find(
            (loadout) => loadout.slot === normalizedSlot,
          )?.nodeIds ?? [],
        nodeIds,
        unlockedLayerIds: pathState.unlockedLayerIds,
        methods: sect.methods,
      });
    } catch (error) {
      throw new SectError(
        'SECT_INVALID_MERIDIAN',
        error instanceof Error ? error.message : '经脉方案无效',
        400,
      );
    }
    SectTradition.rehydrate(sect).setMeridianLoadout(
      pathId,
      normalizedSlot,
      validated,
    );
    await this.repository.replaceMeridianLoadout(
      sect.membershipId,
      pathId,
      normalizedSlot,
      validated,
    );
    return this.requireActive(cultivatorId);
  }

  async activateMeridianLoadout(
    cultivatorId: string,
    pathId: string,
    slot: number,
  ) {
    const normalizedSlot = this.requireEnabledSlot(slot);
    const { sect } = await this.requirePath(cultivatorId, pathId);
    SectTradition.rehydrate(sect).activateMeridianLoadout(
      pathId,
      normalizedSlot,
    );
    await this.repository.activateMeridianLoadout(
      sect.membershipId,
      pathId,
      normalizedSlot,
    );
    return this.requireActive(cultivatorId);
  }

  async setAbilityLoadout(
    cultivatorId: string,
    rawSlots: Array<string | null>,
  ) {
    const sect = await this.requireActive(cultivatorId);
    const module = this.runtime.registry.require(sect.sectId);
    this.authorizer.assertOrganization(
      module.organization,
      sect.discipleRank ?? 'registered',
      'sect.arena.use',
    );
    let slots;
    try {
      slots = this.abilityLoadout.validate(module.definition, sect, rawSlots);
    } catch (error) {
      throw new SectError(
        'SECT_INVALID_LOADOUT',
        error instanceof Error ? error.message : '神通栏配置无效',
        400,
      );
    }
    SectTradition.rehydrate(sect).setAbilityLoadout(slots);
    await this.repository.replaceAbilityLoadout(sect.membershipId, slots);
    return this.requireActive(cultivatorId);
  }

  async setPathTactic(cultivatorId: string, pathId: string, tacticId: string) {
    const { sect, path } = await this.requirePath(cultivatorId, pathId);
    if (!path.tactics.some((tactic) => tactic.id === tacticId))
      throw new SectError('SECT_PATH_UNKNOWN', '未知流派战术', 400);
    SectTradition.rehydrate(sect).setTactic(pathId, tacticId);
    await this.repository.setPathTactic(sect.membershipId, pathId, tacticId);
    return this.requireActive(cultivatorId);
  }

  async trainMethodCommand(args: {
    cultivatorId: string;
    methodId: string;
    targetLevel: number;
  }) {
    const result = await this.trainMethod(args);
    return this.paidCommand(result, 'sect.method_trained');
  }

  async unlockPathLayerCommand(args: {
    cultivatorId: string;
    pathId: string;
    layerId: string;
  }) {
    const result = await this.unlockPathLayer(args);
    return this.paidCommand(result, 'sect.path_layer_unlocked');
  }

  async activatePathCommand(cultivatorId: string, pathId: string) {
    const sect = await this.activatePath(cultivatorId, pathId);
    return this.progressionCommand({ sect }, 'sect.path_activated');
  }

  async setMeridianLoadoutCommand(
    cultivatorId: string,
    pathId: string,
    slot: number,
    nodeIds: string[],
  ) {
    const sect = await this.setMeridianLoadout(
      cultivatorId,
      pathId,
      slot,
      nodeIds,
    );
    return this.progressionCommand({ sect }, 'sect.meridian_updated');
  }

  async activateMeridianLoadoutCommand(
    cultivatorId: string,
    pathId: string,
    slot: number,
  ) {
    const sect = await this.activateMeridianLoadout(cultivatorId, pathId, slot);
    return this.progressionCommand({ sect }, 'sect.meridian_activated');
  }

  async setAbilityLoadoutCommand(
    cultivatorId: string,
    slots: Array<string | null>,
  ) {
    const sect = await this.setAbilityLoadout(cultivatorId, slots);
    return this.progressionCommand({ sect }, 'sect.ability_loadout_updated');
  }

  async setPathTacticCommand(
    cultivatorId: string,
    pathId: string,
    tacticId: string,
  ) {
    const sect = await this.setPathTactic(cultivatorId, pathId, tacticId);
    return this.progressionCommand({ sect }, 'sect.tactic_updated');
  }

  private paidCommand<
    TResult extends {
      sect: CultivatorSectState;
      balances: SectTrainingResourceSnapshot;
    },
  >(result: TResult, eventType: string) {
    const resourceChanges: ResourceChangeDescriptor[] = [
      {
        resourceTopic: 'sect.progression',
        eventType,
        operation: 'merge',
        payload: progressionPayload(result.sect),
      },
      {
        resourceTopic: 'player.currency',
        eventType: `${eventType}.currency`,
        operation: 'merge',
        payload: { spiritStones: result.balances.stones },
      },
      {
        resourceTopic: 'player.progress',
        eventType: `${eventType}.progress`,
        operation: 'replace',
        payload: result.balances.resourceProgress,
      },
    ];
    return { result, resourceChanges };
  }

  private progressionCommand<TResult extends { sect: CultivatorSectState }>(
    result: TResult,
    eventType: string,
  ) {
    return {
      result,
      resourceChanges: [
        {
          resourceTopic: 'sect.progression',
          eventType,
          operation: 'merge',
          payload: progressionPayload(result.sect),
        },
      ] satisfies ResourceChangeDescriptor[],
    };
  }

  private async requirePath(cultivatorId: string, pathId: string) {
    const sect = await this.requireActive(cultivatorId);
    const module = this.runtime.registry.require(sect.sectId);
    this.assertEnlightenment(module.organization, sect);
    const path = module.definition.paths.find((entry) => entry.id === pathId);
    const pathState = sect.paths.find((entry) => entry.pathId === pathId);
    if (!path || !pathState)
      throw new SectError('SECT_PATH_NOT_LEARNED', '尚未习得该流派');
    this.assertPathRealm(await this.requireProgress(cultivatorId), path);
    return { sect, path, pathState };
  }

  private assertEnlightenment(
    organization: ReturnType<
      SectRuntime['registry']['require']
    >['organization'],
    sect: CultivatorSectState,
  ) {
    this.authorizer.assertOrganization(
      organization,
      sect.discipleRank ?? 'registered',
      'sect.enlightenment.use',
    );
  }

  private assertPathRealm(
    cultivator: SectTrainingResourceSnapshot,
    path: SectPathDefinition,
  ) {
    if (
      getRealmStageRank(cultivator.realm, cultivator.stage) <
      getRealmStageRank(path.minRealm, path.minRealmStage)
    )
      throw new SectError(
        'SECT_REALM_GATE',
        `${path.name}须达${path.minRealm}${path.minRealmStage}后方可参悟`,
        400,
      );
  }

  private requireEnabledSlot(slot: number): 1 | 2 | 3 {
    if (slot !== 1 && slot !== 2 && slot !== 3)
      throw new SectError('SECT_INVALID_MERIDIAN', '经脉方案槽无效', 400);
    if (
      !(
        StandardSectRules.enabledMeridianLoadoutSlots as readonly number[]
      ).includes(slot)
    )
      throw new SectError('SECT_INVALID_MERIDIAN', '参悟方案暂未开放', 400);
    return slot;
  }

  private async requireActive(cultivatorId: string) {
    const sect = await this.repository.load(cultivatorId);
    if (!sect || sect.status !== 'active')
      throw new SectError('SECT_MEMBERSHIP_REQUIRED', '尚未拜入宗门');
    return sect;
  }

  private async requireProgress(cultivatorId: string) {
    const progress = await this.resources.load(cultivatorId);
    if (!progress) throw new SectError('SECT_REALM_GATE', '角色不存在', 400);
    return progress;
  }

  private async payTrainingCost(
    cultivator: SectTrainingResourceSnapshot,
    cultivatorId: string,
    cost: SectTrainingCost,
  ): Promise<SectTrainingResourceSnapshot> {
    if (cultivator.cultivationExp < cost.cultivationExp)
      throw new SectError('SECT_INSUFFICIENT_RESOURCES', '修为不足');
    if (cultivator.comprehensionInsight < cost.comprehensionInsight)
      throw new SectError('SECT_INSUFFICIENT_RESOURCES', '道心感悟不足');
    if (cultivator.stones < cost.spiritStones)
      throw new SectError('SECT_INSUFFICIENT_RESOURCES', '灵石不足');
    if (!(await this.resources.spend(cultivatorId, cost)))
      throw new SectError('SECT_INSUFFICIENT_RESOURCES', '研习所需资源不足');
    return this.requireProgress(cultivatorId);
  }
}

function progressionPayload(sect: CultivatorSectState) {
  return {
    activePathId: sect.activePathId,
    methods: sect.methods,
    paths: sect.paths,
    abilityLoadout: sect.abilityLoadout,
  };
}
