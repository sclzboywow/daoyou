import type { DbTransaction } from '@server/lib/drizzle/db';
import { cultivators } from '@server/lib/drizzle/schema';
import { createDomainEvent } from '@server/lib/mq/domainEventWriter';
import { publishTransactionalMessageBestEffort } from '@server/lib/mq/transactionalMessagePublisher';
import { redisLockKeys, withRedisLock } from '@server/lib/redis/lock';
import * as betBattleRepository from '@server/lib/repositories/betBattleRepository';
import { getPlayerLoadoutByCultivatorId } from '@server/lib/services/cultivator/CultivatorLoadoutReader';
import type { ResourceChangeDescriptor } from '@shared/contracts/resources';
import type { RealmType } from '@shared/types/constants';
import { eq } from 'drizzle-orm';
import {
  cancelBetBattle,
  challengeBetBattle,
  createBetBattle,
  type BetStakeInventoryChange,
} from './BetBattleService';
import { playerCommandExecutor } from './CommandExecutors';
import { readCultivatorName } from './cultivator/CultivatorFactsReader';

type Stake = {
  stakeType: 'spirit_stones' | 'item';
  stakeItem?: {
    itemType: 'material' | 'artifact' | 'consumable';
  } | null;
};

async function stakeResourceChanges(
  args: Stake & {
    cultivatorId: string;
    tx: DbTransaction;
    inventoryChange?: BetStakeInventoryChange;
  },
): Promise<ResourceChangeDescriptor[]> {
  if (args.stakeType === 'spirit_stones') {
    const [currency] = await args.tx
      .select({ spiritStones: cultivators.spirit_stones })
      .from(cultivators)
      .where(eq(cultivators.id, args.cultivatorId))
      .limit(1);
    if (!currency) throw new Error('赌战结算后角色不存在');
    return [
      {
        resourceTopic: 'player.currency',
        eventType: 'currency.bet_battle.staked',
        operation: 'merge',
        payload: { spiritStones: currency.spiritStones },
      },
    ];
  }
  if (!args.stakeItem || !args.inventoryChange) return [];
  const changes: ResourceChangeDescriptor[] = [
    args.inventoryChange.operation === 'upsert'
      ? ({
          resourceTopic: `inventory.${args.inventoryChange.kind}`,
          eventType: 'inventory.bet_battle.staked',
          operation: 'upsert-items',
          payload: { idKey: 'id', items: [args.inventoryChange.item] },
        } as ResourceChangeDescriptor)
      : ({
          resourceTopic: `inventory.${args.inventoryChange.kind}`,
          eventType: 'inventory.bet_battle.staked',
          operation: 'remove-items',
          payload: { idKey: 'id', ids: [args.inventoryChange.id] },
        } as ResourceChangeDescriptor),
  ];
  if (args.stakeItem.itemType === 'artifact') {
    const loadout = await getPlayerLoadoutByCultivatorId(
      args.cultivatorId,
      args.tx,
    );
    changes.push({
      resourceTopic: 'player.loadout',
      eventType: 'loadout.bet_battle.staked',
      operation: 'replace',
      payload: loadout,
    });
  }
  return changes;
}

export async function executeBetBattleCreateCommand(
  args: Parameters<typeof createBetBattle>[0] & {
    creatorUserId: string;
    tx: DbTransaction;
  },
) {
  const { tx, creatorUserId, ...input } = args;
  const created = await createBetBattle(input, { tx });
  const resourceChanges = await stakeResourceChanges({
    ...input,
    cultivatorId: input.creatorId,
    tx,
    inventoryChange: created.stakeInventoryChange,
  });
  const listing = await betBattleRepository.findListingById(
    created.battleId,
    tx,
  );
  if (!listing) throw new Error('赌战创建后记录不存在');
  const event = await createDomainEvent(
    {
      type: 'bet-battle.created',
      aggregate: { type: 'bet-battle', id: created.battleId },
      data: {
        userId: creatorUserId,
        cultivatorId: input.creatorId,
        cultivatorName: input.creatorName,
        battleId: created.battleId,
        ...(input.taunt?.trim() ? { taunt: input.taunt.trim() } : {}),
      },
      deduplicationKey: created.battleId,
    },
    tx,
  );
  return {
    result: {
      battleId: created.battleId,
      message: '赌战发起成功，等待道友应战',
      listing,
    },
    resourceChanges,
    domainEventId: event.id,
  };
}

export async function executeBetBattleCancelCommand(args: {
  battleId: string;
  cultivatorId: string;
  tx: DbTransaction;
}) {
  await cancelBetBattle(args.battleId, args.cultivatorId, { tx: args.tx });
  const listing = await betBattleRepository.findListingById(
    args.battleId,
    args.tx,
  );
  if (!listing) throw new Error('赌战取消后记录不存在');
  return {
    result: {
      message: '赌战已取消，押注将通过邮件返还',
      listing,
    },
    resourceChanges: [],
  };
}

export async function executeBetBattleChallengeCommand(
  args: Parameters<typeof challengeBetBattle>[0] & { tx: DbTransaction },
) {
  const { tx, ...input } = args;
  const challenge = await challengeBetBattle(input, { tx });
  const isWin = challenge.winnerId === input.challengerId;
  const stakeChanges = await stakeResourceChanges({
    ...input,
    cultivatorId: input.challengerId,
    tx,
    inventoryChange: challenge.stakeInventoryChange,
  });
  const event = await createDomainEvent(
    {
      type: 'bet-battle.settled',
      aggregate: { type: 'bet-battle', id: challenge.battleId },
      data: {
        userId: input.challengerUserId,
        cultivatorId: input.challengerId,
        battleId: challenge.battleId,
        rumor: challenge.rumor,
      },
      deduplicationKey: challenge.battleId,
    },
    tx,
  );
  return {
    result: {
      type: 'battle_result',
      battleResult: challenge.battleResult,
      settlement: {
        isWin,
        winnerId: challenge.winnerId,
        battleId: challenge.battleId,
        battleRecordV3Id: challenge.battleRecordV3Id,
        resultMessage: isWin
          ? '你力压对手，赢得赌战押注，奖励已发放邮件。'
          : '你此战失利，押注归对方所有，下次再战。',
        rumor: challenge.rumor,
      },
    },
    resourceChanges: stakeChanges,
    domainEventId: event.id,
  };
}

type BetBattleActor = {
  userId: string;
  cultivatorId: string;
};

type BetStake = {
  stakeType: 'spirit_stones' | 'item';
  spiritStones?: number;
  stakeItem?: {
    itemType: 'material' | 'artifact' | 'consumable';
    itemId: string;
    quantity: number;
  } | null;
};

export async function createBetBattleCommand(
  args: {
    actor: BetBattleActor;
    minRealm: RealmType;
    maxRealm: RealmType;
    taunt?: string;
  } & BetStake,
) {
  const { name: cultivatorName } = await readCultivatorName(
    args.actor.cultivatorId,
  );
  let domainEventId: string | undefined;
  const committed = await playerCommandExecutor.executeWithLock({
    userId: args.actor.userId,
    cultivatorId: args.actor.cultivatorId,
    source: 'bet_battle_create',
    lock: { context: 'bet-battle-create', timeoutMs: 10_000 },
    command: async (tx) => {
      const command = await executeBetBattleCreateCommand({
        creatorUserId: args.actor.userId,
        creatorId: args.actor.cultivatorId,
        creatorName: cultivatorName,
        minRealm: args.minRealm,
        maxRealm: args.maxRealm,
        taunt: args.taunt,
        stakeType: args.stakeType,
        spiritStones: args.spiritStones,
        stakeItem: args.stakeItem,
        tx,
      });
      domainEventId = command.domainEventId;
      return command;
    },
  });
  publishTransactionalMessageBestEffort(domainEventId, {
    source: 'bet_battle_create',
    cultivatorId: args.actor.cultivatorId,
  });
  return committed;
}

export async function cancelBetBattleCommand(args: {
  actor: BetBattleActor;
  battleId: string;
}) {
  return withRedisLock(
    {
      keys: [
        redisLockKeys.betBattle(args.battleId),
        redisLockKeys.cultivatorMutation(args.actor.cultivatorId),
      ],
      context: 'bet-battle-cancel',
      timeoutMs: 10_000,
      retries: 0,
    },
    (lease) =>
      playerCommandExecutor.execute({
        coordination: { mode: 'redis', lease },
        userId: args.actor.userId,
        cultivatorId: args.actor.cultivatorId,
        source: 'bet_battle_cancel',
        allowEmpty: true,
        idempotency: {
          key: `bet-battle-cancel:${args.battleId}`,
          fingerprint: `${args.actor.cultivatorId}:${args.battleId}`,
        },
        command: (tx) =>
          executeBetBattleCancelCommand({
            battleId: args.battleId,
            cultivatorId: args.actor.cultivatorId,
            tx,
          }),
      }),
  );
}

export async function challengeBetBattleCommand(
  args: {
    actor: BetBattleActor;
    battleId: string;
    requestFingerprint: string;
  } & BetStake,
) {
  const { name: cultivatorName } = await readCultivatorName(
    args.actor.cultivatorId,
  );
  let domainEventId: string | undefined;
  const committed = await withRedisLock(
    {
      keys: [
        redisLockKeys.betBattle(args.battleId),
        redisLockKeys.cultivatorMutation(args.actor.cultivatorId),
      ],
      context: 'bet-battle-challenge',
      timeoutMs: 10_000,
      retries: 0,
    },
    (lease) =>
      playerCommandExecutor.execute({
        coordination: { mode: 'redis', lease },
        userId: args.actor.userId,
        cultivatorId: args.actor.cultivatorId,
        source: 'bet_battle_challenge',
        idempotency: {
          key: `bet-battle-challenge:${args.battleId}`,
          fingerprint: args.requestFingerprint,
        },
        command: async (tx) => {
          const command = await executeBetBattleChallengeCommand({
            battleId: args.battleId,
            challengerId: args.actor.cultivatorId,
            challengerName: cultivatorName,
            challengerUserId: args.actor.userId,
            stakeType: args.stakeType,
            spiritStones: args.spiritStones,
            stakeItem: args.stakeItem,
            tx,
          });
          domainEventId = command.domainEventId;
          return command;
        },
      }),
  );
  publishTransactionalMessageBestEffort(domainEventId, {
    source: 'bet_battle_challenge',
    cultivatorId: args.actor.cultivatorId,
  });
  return committed;
}
