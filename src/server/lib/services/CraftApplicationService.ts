import type { DbTransaction } from '@server/lib/drizzle/db';
import { redisLockKeys, withRedisLock } from '@server/lib/redis/lock';
import { createMessage } from '@server/lib/repositories/worldChatRepository';
import { getPlayerLoadoutByCultivatorId } from '@server/lib/services/cultivator/CultivatorLoadoutReader';
import { normalizeFreeformLlmInput } from '@server/utils/llmPayload';
import type { QiAction } from '@shared/config/qiSystem';
import type { ResourceChangeDescriptor } from '@shared/contracts/resources';
import { type CreationCraftType } from '@shared/engine/creation-v2/config/CreationCraftPolicy';
import type { CreationProductType } from '@shared/engine/creation-v2/types';
import type { ResourceOperationSettlement } from '@shared/engine/resource/types';
import {
  QUALITY_ORDER,
  type ElementType,
  type EquipmentSlot,
  type Quality,
} from '@shared/types/constants';
import type { AlchemyMode } from '@shared/types/consumable';
import type { Consumable } from '@shared/types/cultivator';
import type { ItemShowcaseSnapshotMap } from '@shared/types/world-chat';
import { randomUUID } from 'node:crypto';
import { prepareFormulaCraft } from './AlchemyFormulaService';
import { prepareAlchemyCraft } from './alchemyServiceV2';
import {
  playerCommandExecutor,
  type CommittedCommand,
} from './CommandExecutors';
import {
  abandonPending,
  prepareCreation,
  prepareCreationConfirmation,
} from './creationServiceV2';
import { readCultivatorName } from './cultivator/CultivatorFactsReader';
import {
  readPlayerProgress,
  readPlayerTaskSummary,
} from './PlayerResourceReaderService';
import {
  qiCurrencyChange,
  type QiSettlementBaseline,
} from './QiResourceChanges';
import { QiService } from './QiService';
import { TaskService } from './TaskService';

const WORLD_CHAT_BROADCAST_QUALITY_FLOOR: Quality = '天品';

type CraftTargetPolicy = {
  team: 'enemy' | 'ally' | 'self' | 'any';
  scope: 'single' | 'aoe' | 'random';
  maxTargets?: number;
};

export type CraftCommandInput = {
  materialIds: string[];
  craftType: CreationCraftType | 'alchemy';
  alchemyMode?: AlchemyMode;
  formulaId?: string;
  analysisId?: string;
  materialQuantities?: Record<string, number>;
  userPrompt?: string;
  requestedSlot?: EquipmentSlot;
  requestedTargetPolicy?: CraftTargetPolicy;
};

type BroadcastableCreationResult = {
  id: string;
  productType: CreationProductType;
  name: string;
  description: string | null;
  element: string | null;
  quality: string | null;
  slot: string | null;
  score: number;
  productModel: Record<string, unknown>;
  needs_replace?: boolean;
};

export async function executeCraftCommand(args: {
  userId: string;
  cultivatorId: string;
  input: CraftCommandInput;
}): Promise<CommittedCommand<unknown>> {
  const { input } = args;
  const { name: cultivatorName } = await readCultivatorName(args.cultivatorId);
  if (input.materialIds.length === 0) {
    throw new CraftCommandError('参数缺失，请选择材料');
  }
  const normalizedUserPrompt = input.userPrompt
    ? normalizeFreeformLlmInput(input.userPrompt)
    : undefined;
  if (input.craftType === 'alchemy') {
    const mode = input.alchemyMode ?? 'improvised';
    if (mode === 'improvised' && !normalizedUserPrompt) {
      throw new CraftCommandError('请注入神念，描述丹药功效。');
    }
    if (mode === 'formula' && !input.formulaId) {
      throw new CraftCommandError('请先选定丹方。');
    }
    if (mode === 'formula' && !input.analysisId) {
      throw new CraftCommandError('请先推演药路。');
    }
    const prepared =
      mode === 'improvised'
        ? await prepareAlchemyCraft(args.cultivatorId, input.materialIds, {
            materialQuantities: input.materialQuantities,
            userPrompt: normalizedUserPrompt,
          })
        : await prepareFormulaCraft(
            args.cultivatorId,
            input.formulaId!,
            input.materialIds,
            input.materialQuantities,
            input.analysisId,
          );
    let afterCommit: (() => Promise<void>) | undefined;
    const actionInstanceId = randomUUID();
    const committed = await playerCommandExecutor.executeWithLock({
      userId: args.userId,
      cultivatorId: args.cultivatorId,
      source: `alchemy_${mode}`,
      lock: {
        context: `alchemy-${mode}`,
        timeoutMs: 60_000,
      },
      command: async (tx) => {
        const qiReservation = await QiService.reserveQi({
          cultivatorId: args.cultivatorId,
          action: craftQiAction('alchemy', mode),
          actionInstanceId,
          metadata: {
            craftType: 'alchemy',
            alchemyMode: mode,
            materialCount: input.materialIds.length,
            formulaId: input.formulaId,
          },
          tx,
        });
        const preparedCommit = await prepared.commit(tx);
        afterCommit = preparedCommit.afterCommit;
        await QiService.commitReservation({
          actionInstanceId,
          metadata: { committedAt: new Date().toISOString() },
          tx,
        });
        await TaskService.recordTaskEvent(
          args.cultivatorId,
          'alchemy_crafted',
          { tx },
        );
        return {
          result: preparedCommit.result,
          resourceChanges: await settleAlchemyCraft({
            cultivatorId: args.cultivatorId,
            tx,
            qi: qiReservation,
            taskSynced: true,
            inventoryChanges: preparedCommit.inventoryChanges,
          }),
        };
      },
    });
    await runAfterCommit(afterCommit, args.cultivatorId, `alchemy_${mode}`);
    await broadcastAlchemyRumor({
      userId: args.userId,
      cultivatorName: cultivatorName,
      consumable: (committed.result as { consumable?: Consumable }).consumable,
    });
    return committed;
  }

  const creationCraftType = input.craftType;
  const prepared = await prepareCreation(
    args.cultivatorId,
    input.materialIds,
    creationCraftType,
    {
      materialQuantities: input.materialQuantities,
      userPrompt: normalizedUserPrompt,
      requestedSlot: input.requestedSlot,
      requestedTargetPolicy: input.requestedTargetPolicy,
    },
  );
  let afterCommit: (() => Promise<void>) | undefined;
  const actionInstanceId = randomUUID();
  const committed = await playerCommandExecutor.executeWithLock({
    userId: args.userId,
    cultivatorId: args.cultivatorId,
    source: `creation_${creationCraftType}`,
    lock: {
      context: `creation-${creationCraftType}`,
      timeoutMs: 60_000,
    },
    command: async (tx) => {
      const qiReservation = await QiService.reserveQi({
        cultivatorId: args.cultivatorId,
        action: craftQiAction(creationCraftType),
        actionInstanceId,
        metadata: {
          craftType: creationCraftType,
          materialCount: input.materialIds.length,
          requestedSlot: input.requestedSlot,
        },
        tx,
      });
      const preparedCommit = await prepared.commit(tx);
      afterCommit = preparedCommit.afterCommit;
      await QiService.commitReservation({
        actionInstanceId,
        metadata: { committedAt: new Date().toISOString() },
        tx,
      });
      return {
        result: preparedCommit.result,
        resourceChanges: await settleCreationCraft({
          cultivatorId: args.cultivatorId,
          tx,
          craftType: creationCraftType,
          qi: qiReservation,
          needsReplace: Boolean(preparedCommit.result.needs_replace),
          inventoryChanges: preparedCommit.inventoryChanges,
        }),
      };
    },
  });
  await runAfterCommit(
    afterCommit,
    args.cultivatorId,
    `creation_${creationCraftType}`,
  );
  await broadcastCreationRumor({
    userId: args.userId,
    cultivatorName: cultivatorName,
    item: committed.result as BroadcastableCreationResult,
  });
  return committed;
}

export async function executeCreationConfirmationCommand(args: {
  userId: string;
  cultivatorId: string;
  craftType: CreationCraftType;
  replaceId?: string | null;
  abandon?: boolean;
}): Promise<
  | { kind: 'abandoned'; message: string }
  | {
      kind: 'committed';
      committed: CommittedCommand<{
        message: string;
        item: unknown;
      }>;
    }
> {
  const { name: cultivatorName } = await readCultivatorName(args.cultivatorId);
  if (args.abandon) {
    await withRedisLock(
      {
        key: redisLockKeys.cultivatorMutation(args.cultivatorId),
        context: 'creation-abandon',
        timeoutMs: 10_000,
        retries: 0,
      },
      async (lease) => {
        lease.assertHeld();
        await abandonPending(args.cultivatorId, args.craftType);
        lease.assertHeld();
      },
    );
    return { kind: 'abandoned', message: '已放弃新生成的感悟' };
  }
  const prepared = await prepareCreationConfirmation(
    args.cultivatorId,
    args.craftType,
    args.replaceId ?? null,
  );
  let afterCommit: (() => Promise<void>) | undefined;
  const committed = await playerCommandExecutor.executeWithLock({
    userId: args.userId,
    cultivatorId: args.cultivatorId,
    source: 'creation_confirm',
    lock: { context: 'creation-confirm', timeoutMs: 10_000 },
    command: async (tx) => {
      const preparedCommit = await prepared.commit(tx);
      afterCommit = preparedCommit.afterCommit;
      return {
        result: {
          message: '领悟成功，已纳入道基',
          item: preparedCommit.result,
        },
        resourceChanges: await settleCreationConfirmation({
          craftType: args.craftType,
          cultivatorId: args.cultivatorId,
          tx,
          inventoryChanges: preparedCommit.inventoryChanges,
        }),
      };
    },
  });
  await runAfterCommit(afterCommit, args.cultivatorId, 'creation_confirm');
  await broadcastCreationRumor({
    userId: args.userId,
    cultivatorName: cultivatorName,
    item: committed.result.item as BroadcastableCreationResult,
  });
  return { kind: 'committed', committed };
}

export class CraftCommandError extends Error {
  readonly status = 400;
}

export async function settleAlchemyCraft(args: {
  cultivatorId: string;
  tx: DbTransaction;
  qi: QiSettlementBaseline;
  taskSynced: boolean;
  inventoryChanges: ResourceOperationSettlement['inventoryChanges'];
}): Promise<ResourceChangeDescriptor[]> {
  const changes: ResourceChangeDescriptor[] = [
    qiCurrencyChange('currency.changed', args.qi),
  ];
  for (const change of args.inventoryChanges) {
    changes.push(
      change.operation === 'upsert'
        ? ({
            resourceTopic: `inventory.${change.kind}`,
            eventType: 'inventory.alchemy.changed',
            operation: 'upsert-items',
            payload: { idKey: 'id', items: [change.item] },
          } as ResourceChangeDescriptor)
        : ({
            resourceTopic: `inventory.${change.kind}`,
            eventType: 'inventory.alchemy.changed',
            operation: 'remove-items',
            payload: { idKey: 'id', ids: [change.id] },
          } as ResourceChangeDescriptor),
    );
  }
  if (args.taskSynced) {
    const taskSummary = await readPlayerTaskSummary(args.cultivatorId, args.tx);
    changes.push({
      resourceTopic: 'player.task-summary',
      eventType: 'tasks.changed',
      operation: 'replace',
      payload: taskSummary,
    });
  }
  return changes;
}

export async function settleCreationCraft(args: {
  cultivatorId: string;
  tx: DbTransaction;
  craftType: CreationCraftType;
  qi: QiSettlementBaseline;
  needsReplace?: boolean;
  inventoryChanges: ResourceOperationSettlement['inventoryChanges'];
}): Promise<ResourceChangeDescriptor[]> {
  const changes: ResourceChangeDescriptor[] = [
    qiCurrencyChange('currency.changed', args.qi),
  ];
  for (const change of args.inventoryChanges) {
    changes.push(
      change.operation === 'upsert'
        ? ({
            resourceTopic: `inventory.${change.kind}`,
            eventType: 'inventory.creation.changed',
            operation: 'upsert-items',
            payload: { idKey: 'id', items: [change.item] },
          } as ResourceChangeDescriptor)
        : ({
            resourceTopic: `inventory.${change.kind}`,
            eventType: 'inventory.creation.changed',
            operation: 'remove-items',
            payload: { idKey: 'id', ids: [change.id] },
          } as ResourceChangeDescriptor),
    );
  }
  if (args.craftType === 'create_skill' || args.craftType === 'create_gongfa') {
    const progress = await readPlayerProgress(args.cultivatorId, args.tx);
    changes.push({
      resourceTopic: 'player.progress',
      eventType: 'progress.changed',
      operation: 'replace',
      payload: progress,
    });
  }
  if (
    !args.needsReplace &&
    (args.craftType === 'create_skill' || args.craftType === 'create_gongfa')
  ) {
    const loadout = await getPlayerLoadoutByCultivatorId(
      args.cultivatorId,
      args.tx,
    );
    changes.push({
      resourceTopic: 'player.loadout',
      eventType: 'loadout.changed',
      operation: 'replace',
      payload: loadout,
    });
  }
  return changes;
}

export async function settleCreationConfirmation(args: {
  craftType: CreationCraftType;
  cultivatorId: string;
  tx: DbTransaction;
  inventoryChanges: ResourceOperationSettlement['inventoryChanges'];
}): Promise<ResourceChangeDescriptor[]> {
  const loadout = await getPlayerLoadoutByCultivatorId(
    args.cultivatorId,
    args.tx,
  );
  return [
    {
      resourceTopic: 'player.loadout',
      eventType: 'loadout.changed',
      operation: 'replace',
      payload: loadout,
    },
    ...args.inventoryChanges.map((change) =>
      change.operation === 'upsert'
        ? ({
            resourceTopic: `inventory.${change.kind}`,
            eventType: 'inventory.creation.confirmed',
            operation: 'upsert-items',
            payload: { idKey: 'id', items: [change.item] },
          } as ResourceChangeDescriptor)
        : ({
            resourceTopic: `inventory.${change.kind}`,
            eventType: 'inventory.creation.confirmed',
            operation: 'remove-items',
            payload: { idKey: 'id', ids: [change.id] },
          } as ResourceChangeDescriptor),
    ),
  ];
}

function craftQiAction(
  craftType: CreationCraftType | 'alchemy',
  alchemyMode?: AlchemyMode,
): QiAction {
  if (craftType === 'alchemy') {
    return alchemyMode === 'formula' ? 'alchemy_formula' : 'alchemy_improvised';
  }
  if (craftType === 'refine') return 'creation_artifact';
  if (craftType === 'create_gongfa') return 'creation_gongfa';
  return 'creation_skill';
}

async function runAfterCommit(
  afterCommit: (() => Promise<void>) | undefined,
  cultivatorId: string,
  source: string,
): Promise<void> {
  if (!afterCommit) return;
  try {
    await afterCommit();
  } catch (error) {
    console.error('造物后置副作用失败:', { cultivatorId, source, error });
  }
}

function isBroadcastQuality(quality: string | null): quality is Quality {
  return (
    typeof quality === 'string' &&
    quality in QUALITY_ORDER &&
    QUALITY_ORDER[quality as Quality] >=
      QUALITY_ORDER[WORLD_CHAT_BROADCAST_QUALITY_FLOOR]
  );
}

function buildCreationShowcaseSnapshot(
  item: BroadcastableCreationResult,
): ItemShowcaseSnapshotMap[CreationProductType] {
  if (item.productType === 'artifact') {
    return {
      id: item.id,
      name: item.name,
      slot: item.slot as ItemShowcaseSnapshotMap['artifact']['slot'],
      element: item.element as ItemShowcaseSnapshotMap['artifact']['element'],
      quality: item.quality as ItemShowcaseSnapshotMap['artifact']['quality'],
      description: item.description ?? undefined,
      productModel: item.productModel,
    };
  }
  if (item.productType === 'skill') {
    return {
      id: item.id,
      name: item.name,
      productType: 'skill',
      element: item.element as ElementType | null,
      quality: item.quality as Quality | null,
      description: item.description,
      score: item.score,
      productModel: item.productModel,
    };
  }
  return {
    id: item.id,
    name: item.name,
    productType: 'gongfa',
    element: item.element as ElementType | null,
    quality: item.quality as Quality | null,
    description: item.description,
    score: item.score,
    productModel: item.productModel,
  };
}

async function broadcastCreationRumor(args: {
  userId: string;
  cultivatorName: string;
  item: BroadcastableCreationResult;
}): Promise<void> {
  if (
    !args.item.id ||
    args.item.needs_replace ||
    !isBroadcastQuality(args.item.quality)
  ) {
    return;
  }
  const text = `由${args.cultivatorName}炼成，品阶已入${args.item.quality}，灵韵自生，足令诸修侧目。`;
  try {
    await createMessage({
      senderUserId: args.userId,
      senderCultivatorId: null,
      senderName: '修仙界传闻',
      senderRealm: '炼气',
      senderRealmStage: '系统',
      channel: 'system',
      messageType: 'item_showcase',
      textContent: text,
      payload: {
        itemType: args.item.productType,
        itemId: args.item.id,
        snapshot: buildCreationShowcaseSnapshot(args.item),
        text,
      },
    });
  } catch (error) {
    console.error('造物传闻发送失败:', error);
  }
}

async function broadcastAlchemyRumor(args: {
  userId: string;
  cultivatorName: string;
  consumable?: Consumable;
}): Promise<void> {
  if (
    !args.consumable?.id ||
    !isBroadcastQuality(args.consumable.quality ?? null)
  ) {
    return;
  }
  const text = `由${args.cultivatorName}炼成，丹品已入${args.consumable.quality}，药香化霞，足令诸修侧目。`;
  try {
    await createMessage({
      senderUserId: args.userId,
      senderCultivatorId: null,
      senderName: '修仙界传闻',
      senderRealm: '炼气',
      senderRealmStage: '系统',
      channel: 'system',
      messageType: 'item_showcase',
      textContent: text,
      payload: {
        itemType: 'consumable',
        itemId: args.consumable.id,
        snapshot: {
          id: args.consumable.id,
          name: args.consumable.name,
          type: args.consumable.type,
          quality: args.consumable.quality,
          quantity: args.consumable.quantity,
          description: args.consumable.description,
          spec: args.consumable.spec,
        },
        text,
      },
    });
  } catch (error) {
    console.error('造物传闻发送失败:', error);
  }
}
