import type { SectTaskViewData } from '@shared/contracts/sect';
import {
  resolveSectTaskClaimReward,
  resolveSectTaskDialogue,
  resolveSectTaskExecutionLocationParameters,
  readSectBattleTargetSnapshot,
  summarizeSectBattleTarget,
  type SectTaskDefinition,
} from '@shared/engine/sect';
import type { SectTaskRecord } from './ports';
import type { SectTaskExecutor } from './task-executors/SectTaskExecutor';

function genericDialogue(
  definition: SectTaskDefinition,
): SectTaskViewData['presentation']['dialogue'] {
  const dialogue = definition.presentation.dialogue;
  return {
    offeredReply: dialogue.offeredReply,
    activeReply: dialogue.activeReply,
    claimableReply: dialogue.claimableReply,
    claimedReply: dialogue.claimedReply,
    instruction: [{ text: definition.presentation.description }],
  };
}

export function toUnpersistedSectTaskView(args: {
  definition: SectTaskDefinition;
  periodKey: string;
  state: 'offered' | 'active' | 'locked';
  executor?: SectTaskExecutor;
  enabled: boolean;
  disabledReason?: string;
}): SectTaskViewData {
  const actions =
    args.definition.enrollment === 'manual' &&
    (args.state === 'offered' || args.state === 'locked')
      ? [
          {
            key: 'accept',
            renderer: 'sect.action.accept',
            label: '接下此事',
            enabled: args.enabled,
            ...(args.disabledReason
              ? { disabledReason: args.disabledReason }
              : {}),
          },
        ]
      : (args.executor?.actions(args.definition) ?? []).map((action) => ({
          ...action,
          enabled: args.enabled,
          ...(args.disabledReason
            ? { disabledReason: args.disabledReason }
            : {}),
        }));
  return {
    id: `unpersisted:${args.definition.id}`,
    definitionId: args.definition.id,
    kind: args.definition.kind,
    state: args.state,
    periodKey: args.periodKey,
    progress: { current: 0, target: args.definition.target },
    presentation: {
      title: args.definition.presentation.title,
      description: args.definition.presentation.description,
      dialogue: genericDialogue(args.definition),
    },
    actions,
  };
}

export function toSectTaskView(args: {
  definition: SectTaskDefinition;
  record: SectTaskRecord;
  state: SectTaskViewData['state'];
  executor: SectTaskExecutor;
  enabled: boolean;
  disabledReason?: string;
}): SectTaskViewData {
  const offer = args.record.payload.offer;
  const reward = resolveSectTaskClaimReward(args.record.payload);
  const battleTarget = readSectBattleTargetSnapshot(
    args.record.payload.executorData,
  );
  const executionLocation = resolveSectTaskExecutionLocationParameters(
    args.definition,
  );
  const actions =
    args.state === 'claimed'
      ? []
      : args.state === 'claimable'
        ? [
            {
              key: 'claim',
              renderer: 'sect.action.claim',
              label: '交回回执',
              enabled: args.enabled,
              ...(executionLocation ? { parameters: executionLocation } : {}),
              ...(args.disabledReason
                ? { disabledReason: args.disabledReason }
                : {}),
            },
          ]
        : args.state === 'offered' || args.state === 'locked'
          ? [
              {
                key: 'accept',
                renderer: 'sect.action.accept',
                label: '接下此事',
                enabled: args.enabled,
                ...(executionLocation ? { parameters: executionLocation } : {}),
                ...(args.disabledReason
                  ? { disabledReason: args.disabledReason }
                  : {}),
              },
            ]
          : args.executor.actions(args.definition).map((action) => ({
              ...action,
              enabled: args.enabled,
              ...(args.disabledReason
                ? { disabledReason: args.disabledReason }
                : {}),
            }));
  return {
    id: args.record.id,
    definitionId: args.definition.id,
    kind: args.definition.kind,
    state: args.state,
    periodKey: args.record.periodKey,
    progress: {
      current: args.record.progress,
      target: args.record.payload.target,
    },
    difficulty: offer.difficulty,
    requirement: offer.requirement,
    ...(reward ? { reward } : {}),
    ...(battleTarget
      ? { battleTarget: summarizeSectBattleTarget(battleTarget) }
      : {}),
    presentation: {
      title: args.definition.presentation.title,
      description: args.definition.presentation.description,
      dialogue: resolveSectTaskDialogue({
        definition: args.definition,
        offer,
        progress: {
          current: args.record.progress,
          target: args.record.payload.target,
        },
      }),
    },
    actions,
  };
}
