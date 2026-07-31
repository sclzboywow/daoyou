import type { DbTransaction } from '@server/lib/drizzle/db';
import { cultivators } from '@server/lib/drizzle/schema';
import * as betBattleRepository from '@server/lib/repositories/betBattleRepository';
import { createMessage } from '@server/lib/repositories/worldChatRepository';
import { redisLockKeys, withRedisLock } from '@server/lib/redis/lock';
import type { ResourceChangeDescriptor } from '@shared/contracts/resources';
import type { RealmType } from '@shared/types/constants';
import { eq } from 'drizzle-orm';
import { playerCommandExecutor } from './CommandExecutors';
import {
  cancelBetBattle,
  challengeBetBattle,
  createBetBattle,
  type BetStakeInventoryChange,
} from './BetBattleService';
import {
  getPlayerLoadoutByCultivatorId,
} from '@server/lib/services/cultivator/CultivatorLoadoutReader';
import { readPlayerMailSummary } from './PlayerResourceReaderService';
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
  args: Parameters<typeof createBetBattle>[0] & { tx: DbTransaction },
) {
  const { tx, ...input } = args;
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
  return {
    result: {
      battleId: created.battleId,
      message: '赌战发起成功，等待道友应战',
      listing,
    },
    resourceChanges,
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
  const mailSummary = await readPlayerMailSummary(
    args.cultivatorId,
    args.tx,
  );
  return {
    result: {
      message: '赌战已取消，押注将通过邮件返还',
      listing,
    },
    resourceChanges: [
      {
        resourceTopic: 'player.mail-summary',
        eventType: 'mail.bet_battle.cancel.created',
        operation: 'replace',
        payload: mailSummary,
      },
    ] satisfies ResourceChangeDescriptor[],
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
  const winnerMailSummary = await readPlayerMailSummary(challenge.winnerId, tx);
  return {
    result: {
      type: 'battle_result',
      battleResult: challenge.battleResult,
      settlement: {
        isWin,
        winnerId: challenge.winnerId,
        battleId: challenge.battleId,
        battleRecordV2Id: challenge.battleRecordV2Id,
        resultMessage: isWin
          ? '你力压对手，赢得赌战押注，奖励已发放邮件。'
          : '你此战失利，押注归对方所有，下次再战。',
        rumor: challenge.rumor,
      },
    },
    resourceChanges: [
      ...stakeChanges,
      {
        scope: { kind: 'cultivator', id: challenge.winnerId },
        resourceTopic: 'player.mail-summary',
        eventType: 'mail.bet_battle.settlement.created',
        operation: 'replace',
        payload: winnerMailSummary,
      },
    ] satisfies ResourceChangeDescriptor[],
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

async function publishRumor(args: {
  userId: string;
  messageType: 'duel_invite' | 'text';
  text: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await createMessage({
      senderUserId: args.userId,
      senderCultivatorId: null,
      senderName: '修仙界传闻',
      senderRealm: '炼气',
      senderRealmStage: '系统',
      channel: 'system',
      messageType: args.messageType,
      textContent: args.text,
      payload: args.payload,
    });
  } catch (error) {
    console.error('赌战结算成功但世界频道广播失败:', error);
  }
}

export async function createBetBattleCommand(args: {
  actor: BetBattleActor;
  minRealm: RealmType;
  maxRealm: RealmType;
  taunt?: string;
} & BetStake) {
  const { name: cultivatorName } = await readCultivatorName(
    args.actor.cultivatorId,
  );
  const committed = await playerCommandExecutor.executeWithLock({
    userId: args.actor.userId,
    cultivatorId: args.actor.cultivatorId,
    source: 'bet_battle_create',
    lock: { context: 'bet-battle-create', timeoutMs: 10_000 },
    command: (tx) =>
      executeBetBattleCreateCommand({
        creatorId: args.actor.cultivatorId,
        creatorName: cultivatorName,
        minRealm: args.minRealm,
        maxRealm: args.maxRealm,
        taunt: args.taunt,
        stakeType: args.stakeType,
        spiritStones: args.spiritStones,
        stakeItem: args.stakeItem,
        tx,
      }),
  });
  const taunt = args.taunt?.trim();
  const rumor = taunt
    ? `${cultivatorName}在赌战台放话：${taunt} 有胆便来应战！`
    : `${cultivatorName}在赌战台摆下战帖，静候各路道友应战！`;
  await publishRumor({
    userId: args.actor.userId,
    messageType: 'duel_invite',
    text: rumor,
    payload: {
      battleId: committed.result.battleId,
      routePath: '/game/bet-battle',
      taunt: taunt || undefined,
      expiresAt: undefined,
    },
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

export async function challengeBetBattleCommand(args: {
  actor: BetBattleActor;
  battleId: string;
  requestFingerprint: string;
} & BetStake) {
  const { name: cultivatorName } = await readCultivatorName(
    args.actor.cultivatorId,
  );
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
        command: (tx) =>
          executeBetBattleChallengeCommand({
            battleId: args.battleId,
            challengerId: args.actor.cultivatorId,
            challengerName: cultivatorName,
            challengerUserId: args.actor.userId,
            stakeType: args.stakeType,
            spiritStones: args.spiritStones,
            stakeItem: args.stakeItem,
            tx,
          }),
      }),
  );
  if (!committed.state.replayed) {
    await publishRumor({
      userId: args.actor.userId,
      messageType: 'text',
      text: committed.result.settlement.rumor,
      payload: { text: committed.result.settlement.rumor },
    });
  }
  return committed;
}
