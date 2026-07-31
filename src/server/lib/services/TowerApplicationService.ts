import {
  redisLockKeys,
  withRedisLock,
  type RedisLeaseContext,
} from '@server/lib/redis/lock';
import {
  towerService,
  type TowerBattleRuntimeCommit,
} from '@server/lib/tower/service';
import type { ResourceChangeDescriptor } from '@shared/contracts/resources';
import type { TowerBlessingId } from '@shared/lib/tower';
import { playerCommandExecutor } from './CommandExecutors';
import { readPlayerMailSummary } from './PlayerResourceReaderService';
import { toPlayerStateMutationResponse } from './ResourceMutationResponse';

const TOWER_COMMAND_TIMEOUT_MS = 240_000;

type TowerBattlePublicResult = {
  battleResult: Awaited<
    ReturnType<typeof towerService.executeBattle>
  >['battleResult'];
  callbackData: {
    towerState: Awaited<
      ReturnType<typeof towerService.executeBattle>
    >['state'];
    isFinished: boolean;
    settlement: Awaited<
      ReturnType<typeof towerService.executeBattle>
    >['settlement'];
    milestoneReward: Awaited<
      ReturnType<typeof towerService.executeBattle>
    >['milestoneReward'];
  };
};

type TowerBattleCommittedResult = {
  response: TowerBattlePublicResult;
  runtimeCommit: TowerBattleRuntimeCommit;
};

export function executeTowerStartCommand(args: { cultivatorId: string }) {
  return withTowerCommandLock(args.cultivatorId, 'tower-start', () =>
    towerService.startRun(args.cultivatorId),
  );
}

export function executeTowerResetCommand(args: { cultivatorId: string }) {
  return withTowerCommandLock(args.cultivatorId, 'tower-reset', () =>
    towerService.resetRun(args.cultivatorId),
  );
}

export function executeTowerProbeCommand(args: { cultivatorId: string }) {
  return withTowerCommandLock(args.cultivatorId, 'tower-probe', () =>
    towerService.probeBattle(args.cultivatorId),
  );
}

export function executeTowerBlessingCommand(args: {
  cultivatorId: string;
  blessingId: TowerBlessingId;
}) {
  return withTowerCommandLock(args.cultivatorId, 'tower-blessing', () =>
    towerService.chooseBlessing(args.cultivatorId, args.blessingId),
  );
}

export function executeTowerBattleCommand(args: {
  userId: string;
  cultivatorId: string;
  battleId: string;
}) {
  return withTowerCommandLock(
    args.cultivatorId,
    'tower-battle-execute',
    async (lease) => {
      const committed =
        await playerCommandExecutor.execute<TowerBattleCommittedResult>({
          coordination: { mode: 'redis', lease },
          userId: args.userId,
          cultivatorId: args.cultivatorId,
          source: 'tower_battle_execute',
          requestId: args.battleId,
          idempotency: {
            key: `tower-battle:${args.battleId}`,
            fingerprint: `${args.cultivatorId}:${args.battleId}`,
          },
          allowEmpty: true,
          command: async (tx) => {
            const battle = await towerService.executeBattle(
              args.cultivatorId,
              args.battleId,
              tx,
            );
            const response: TowerBattlePublicResult = {
              battleResult: battle.battleResult,
              callbackData: {
                towerState: battle.state,
                isFinished: battle.isFinished,
                settlement: battle.settlement,
                milestoneReward: battle.milestoneReward,
              },
            };
            const resourceChanges: ResourceChangeDescriptor[] = [];
            if (battle.milestoneReward) {
              resourceChanges.push({
                resourceTopic: 'player.mail-summary',
                eventType: 'mail.tower_milestone.created',
                operation: 'replace',
                payload: await readPlayerMailSummary(args.cultivatorId, tx),
              });
            }
            return {
              result: {
                response,
                runtimeCommit: battle.runtimeCommit,
              },
              resourceChanges,
            };
          },
        });

      lease.assertHeld();
      await towerService.commitBattleRuntime(
        args.cultivatorId,
        committed.result.runtimeCommit,
      );
      lease.assertHeld();
      return toPlayerStateMutationResponse({
        result: committed.result.response,
        state: committed.state,
      });
    },
  );
}

function withTowerCommandLock<T>(
  cultivatorId: string,
  context: string,
  command: (lease: RedisLeaseContext) => Promise<T>,
): Promise<T> {
  return withRedisLock(
    {
      key: redisLockKeys.cultivatorMutation(cultivatorId),
      context,
      timeoutMs: TOWER_COMMAND_TIMEOUT_MS,
      retries: 0,
    },
    command,
  );
}
