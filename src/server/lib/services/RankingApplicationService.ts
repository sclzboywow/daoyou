import type { DbTransaction } from '@server/lib/drizzle/db';
import { publishLocalTransactionMessageBestEffort } from '@server/lib/mq/localTransactionMessagePublisher';
import { createTaskProgressMessage } from '@server/lib/mq/task-progress/message';
import {
  acquireChallengeLock,
  addToRanking,
  addToRankingTailIfVacant,
  checkDailyChallenges,
  getCultivatorRank,
  incrementDailyChallenges,
  isRankingEmpty,
  releaseChallengeLock,
  updateRanking,
} from '@server/lib/redis/rankings';
import { createBattleRecordV3 } from '@server/lib/repositories/battleRecordV3Repository';
import { createMessage } from '@server/lib/repositories/worldChatRepository';
import { prepareStandardFullBattle } from '@shared/engine/battle-v5/setup/BattleStateStrategy';
import type { RealmType } from '@shared/types/constants';
import { playerCommandExecutor } from './CommandExecutors';
import {
  loadCultivatorCombatInput,
} from '@server/lib/services/cultivator/CultivatorCombatProjectionReader';
import { MailService, type MailAttachment } from './MailService';
import { readPlayerMailSummary } from './PlayerResourceReaderService';
import { simulateBattleV5 } from './simulateBattleV5';
import { readCultivatorPublicIdentity } from './cultivator/CultivatorFactsReader';

export function settleRankingDirectEntry<T>(result: T) {
  return {
    result,
    resourceChanges: [],
  };
}

export async function executeRankingBattleCommand<T>(args: {
  result: T;
  userId: string;
  cultivatorId: string;
  opponentCultivatorId: string;
  battleResult: Parameters<typeof createBattleRecordV3>[0]['battleResult'];
  tx: DbTransaction;
}) {
  const battleRecord = await createBattleRecordV3(
    {
      userId: args.userId,
      cultivatorId: args.cultivatorId,
      battleType: 'challenge',
      opponentCultivatorId: args.opponentCultivatorId,
      battleResult: args.battleResult,
    },
    args.tx,
  );
  const taskMessage = await createTaskProgressMessage(
    {
      payload: {
        kind: 'activity_event',
        cultivatorId: args.cultivatorId,
        event: 'ranking_challenge_battled',
      },
      deduplicationKey: `${args.cultivatorId}:ranking:${battleRecord.id}`,
    },
    args.tx,
  );
  return {
    result: args.result,
    resourceChanges: [],
    taskMessageId: taskMessage.id,
  };
}

type RankingChangeType = 'challenge_win' | 'vacancy_entry' | null;

export class RankingCommandError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 429,
  ) {
    super(message);
  }
}

async function broadcastRankingChange(params: {
  userId: string;
  changeType: Exclude<RankingChangeType, null> | 'direct_entry';
  challengerName: string;
  targetName?: string;
  realm: RealmType;
  rank: number;
}): Promise<void> {
  const rumor =
    params.changeType === 'direct_entry'
      ? `万界金榜初开，${params.challengerName}登临${params.realm}天骄榜第${params.rank}名。`
      : params.changeType === 'vacancy_entry'
        ? `万界金榜有感，${params.challengerName}虽挑战${params.targetName ?? '榜上修士'}未胜，仍补入${params.realm}天骄榜第${params.rank}名。`
        : `万界金榜有感，${params.challengerName}击败${params.targetName ?? '榜上修士'}，登临${params.realm}天骄榜第${params.rank}名。`;
  try {
    await createMessage({
      senderUserId: params.userId,
      senderCultivatorId: null,
      senderName: '修仙界传闻',
      senderRealm: '炼气',
      senderRealmStage: '系统',
      channel: 'system',
      messageType: 'text',
      textContent: rumor,
      payload: { text: rumor },
    });
  } catch (error) {
    console.error('天骄榜名次变动传音发送失败:', error);
  }
}

export async function runRankingBattleCommand(args: {
  userId: string;
  cultivatorId: string;
  targetId?: string | null;
  rankingRealm: RealmType;
}) {
  const identity = await readCultivatorPublicIdentity(args.cultivatorId);
  const affectsRanking = args.rankingRealm === identity.realm;
  const challengeCheck = await checkDailyChallenges(args.cultivatorId);
  if (!challengeCheck.success) {
    throw new RankingCommandError(
      '今日挑战次数已用完（每日限10次）',
      403,
    );
  }
  const [isEmpty, challengerRank] = await Promise.all([
    isRankingEmpty(args.rankingRealm),
    getCultivatorRank(args.rankingRealm, args.cultivatorId),
  ]);
  const targetId = args.targetId?.trim() || null;
  if (!targetId && affectsRanking && isEmpty && challengerRank === null) {
    await addToRanking(args.rankingRealm, args.cultivatorId, args.userId, 1);
    const committed = await playerCommandExecutor.executeWithLock({
      userId: args.userId,
      cultivatorId: args.cultivatorId,
      source: 'ranking_challenge_direct_entry',
      allowEmpty: true,
      command: async () =>
        settleRankingDirectEntry({
          type: 'direct_entry' as const,
          realm: args.rankingRealm,
          rank: 1,
          remainingChallenges: challengeCheck.remaining,
        }),
    });
    await broadcastRankingChange({
      userId: args.userId,
      changeType: 'direct_entry',
      challengerName: identity.name,
      realm: args.rankingRealm,
      rank: 1,
    });
    return committed;
  }
  if (!targetId) {
    throw new RankingCommandError(
      affectsRanking
        ? '请提供被挑战者ID'
        : '越境榜单不可直接上榜，请选择榜上修士切磋',
      400,
    );
  }
  const targetRank = await getCultivatorRank(args.rankingRealm, targetId);
  if (targetRank === null) {
    throw new RankingCommandError('被挑战者不在排行榜上', 404);
  }
  const challengeLock = await acquireChallengeLock(targetId);
  if (!challengeLock) {
    throw new RankingCommandError(
      '被挑战者正在被其他玩家挑战，请稍后再试',
      429,
    );
  }
  try {
    const [challengerRecord, targetRecord] = await Promise.all([
      loadCultivatorCombatInput(args.cultivatorId),
      loadCultivatorCombatInput(targetId),
    ]);
    if (!challengerRecord || !targetRecord) {
      throw new RankingCommandError('角色不存在', 404);
    }
    const battleResult = simulateBattleV5(
      prepareStandardFullBattle({
        player: challengerRecord.cultivator,
        opponent: targetRecord.cultivator,
      }),
    );
    const isWin = battleResult.outcome.winner.id === args.cultivatorId;
    let newChallengerRank: number | null = challengerRank;
    let newTargetRank: number | null = targetRank;
    let rankChangeType: RankingChangeType = null;
    if (
      affectsRanking &&
      isWin &&
      (challengerRank === null || challengerRank > targetRank)
    ) {
      await updateRanking(args.rankingRealm, args.cultivatorId, targetId);
      [newChallengerRank, newTargetRank] = await Promise.all([
        getCultivatorRank(args.rankingRealm, args.cultivatorId),
        getCultivatorRank(args.rankingRealm, targetId),
      ]);
      if (newChallengerRank !== null) rankChangeType = 'challenge_win';
    } else if (affectsRanking && !isWin && challengerRank === null) {
      newChallengerRank = await addToRankingTailIfVacant(
        args.rankingRealm,
        args.cultivatorId,
      );
      if (newChallengerRank !== null) rankChangeType = 'vacancy_entry';
    }
    const remainingChallenges = await incrementDailyChallenges(
      args.cultivatorId,
    );
    let taskMessageId: string | undefined;
    const committed = await playerCommandExecutor.executeWithLock({
      userId: args.userId,
      cultivatorId: args.cultivatorId,
      source: 'ranking_challenge_battle',
      allowEmpty: true,
      command: async (tx) => {
        const command = await executeRankingBattleCommand({
          result: {
            type: 'battle_result' as const,
            battleResult,
            rankingUpdate: {
              isWin,
              realm: args.rankingRealm,
              affectsRanking,
              challengerRank: newChallengerRank,
              targetRank: newTargetRank,
              remainingChallenges,
              rankChangeType,
            },
          },
          userId: args.userId,
          cultivatorId: args.cultivatorId,
          opponentCultivatorId: targetId,
          battleResult,
          tx,
        });
        taskMessageId = command.taskMessageId;
        return command;
      },
    });
    publishLocalTransactionMessageBestEffort(taskMessageId, {
      source: 'ranking_challenge_battle',
      cultivatorId: args.cultivatorId,
    });
    if (rankChangeType && newChallengerRank !== null) {
      await broadcastRankingChange({
        userId: args.userId,
        changeType: rankChangeType,
        challengerName: challengerRecord.cultivator.name,
        targetName: targetRecord.cultivator.name,
        realm: args.rankingRealm,
        rank: newChallengerRank,
      });
    }
    return committed;
  } finally {
    await releaseChallengeLock(challengeLock);
  }
}

export async function sendWeeklyRankingRewardCommand(args: {
  userId: string;
  cultivatorId: string;
  requestKey: string;
  requestFingerprint: string;
  title: string;
  content: string;
  attachments: MailAttachment[];
}) {
  return playerCommandExecutor.executeWithLock({
    userId: args.userId,
    cultivatorId: args.cultivatorId,
    source: 'rank_weekly_rewards',
    idempotency: {
      key: args.requestKey,
      fingerprint: args.requestFingerprint,
    },
    command: async (tx) => {
      const mail = await MailService.sendMail(
        args.cultivatorId,
        args.title,
        args.content,
        args.attachments,
        'reward',
        tx,
      );
      if (!mail) {
        throw new Error('排行榜奖励邮件创建失败');
      }
      const mailSummary = await readPlayerMailSummary(args.cultivatorId, tx);
      return {
        result: { mailId: mail.id },
        resourceChanges: [
          {
            resourceTopic: 'player.mail-summary',
            eventType: 'mail.rank_weekly_reward.created',
            operation: 'replace',
            payload: mailSummary,
          },
        ],
      };
    },
  });
}
