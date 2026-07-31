import type { DbTransaction } from '@server/lib/drizzle/db';
import type { ResourceChangeDescriptor } from '@shared/contracts/resources';
import { RESOURCE_DATA_SCHEMAS } from '@shared/contracts/resources';
import {
  readPlayerMailSummary,
  readPlayerTaskSummary,
} from './PlayerResourceReaderService';
import { TaskService } from './TaskService';
import { playerCommandExecutor } from './CommandExecutors';

export function claimTaskRewardCommand(args: {
  userId: string;
  cultivatorId: string;
  taskId: string;
}) {
  return playerCommandExecutor.executeWithLock({
    userId: args.userId,
    cultivatorId: args.cultivatorId,
    source: 'task_claim_reward',
    command: (tx) =>
      executeTaskRewardClaimCommand({
        cultivatorId: args.cultivatorId,
        taskId: args.taskId,
        tx,
      }),
  });
}

export function executeTaskChallengeCommand(args: {
  userId: string;
  cultivatorId: string;
  taskId: string;
}) {
  return playerCommandExecutor.executeWithLock({
    userId: args.userId,
    cultivatorId: args.cultivatorId,
    source: 'task_challenge',
    command: async (tx) => {
      const result = await TaskService.runTaskChallenge(
        args.cultivatorId,
        args.taskId,
        { tx },
      );
      const taskSummary = await readPlayerTaskSummary(args.cultivatorId, tx);
      return {
        result,
        resourceChanges: [
          {
            resourceTopic: 'player.tasks',
            eventType: 'tasks.challenge_resolved',
            operation: 'upsert-items',
            payload: {
              idKey: 'id',
              items: [result.task],
            },
          },
          {
            resourceTopic: 'player.task-summary',
            eventType: 'tasks.challenge_resolved',
            operation: 'replace',
            payload: taskSummary,
          },
          {
            resourceTopic: 'player.condition',
            eventType: 'condition.task_battle.settled',
            operation: 'replace',
            payload: RESOURCE_DATA_SCHEMAS['player.condition'].parse(
              result.condition,
            ),
          },
        ],
      };
    },
  });
}

export async function executeTaskRewardClaimCommand(args: {
  cultivatorId: string;
  taskId: string;
  tx: DbTransaction;
}): Promise<{
  result: Awaited<ReturnType<typeof TaskService.claimTaskReward>>;
  resourceChanges: ResourceChangeDescriptor[];
}> {
  const result = await TaskService.claimTaskReward(
    args.cultivatorId,
    args.taskId,
    args.tx,
  );
  const mailSummary = await readPlayerMailSummary(
    args.cultivatorId,
    args.tx,
  );
  const taskSummary = await readPlayerTaskSummary(
    args.cultivatorId,
    args.tx,
  );

  return {
    result,
    resourceChanges: [
      {
        resourceTopic: 'player.task-summary',
        eventType: 'tasks.reward_claimed',
        operation: 'replace',
        payload: taskSummary,
      },
      {
        resourceTopic: 'player.tasks',
        eventType: 'tasks.reward_claimed',
        operation: 'upsert-items',
        payload: {
          idKey: 'id',
          items: [result.task],
        },
      },
      {
        resourceTopic: 'player.mail-summary',
        eventType: 'mail.reward_created',
        payload: mailSummary,
        operation: 'merge',
      },
    ],
  };
}
