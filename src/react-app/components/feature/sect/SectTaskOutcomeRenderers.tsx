import { BattlePageLayout } from '@app/components/feature/battle/BattlePageLayout';
import { BattlePlaybackPanel } from '@app/components/feature/battle/v3/BattlePlaybackPanel';
import { useBattlePlaybackState } from '@app/components/feature/battle/v3/useBattlePlaybackState';
import { CombatResultDialog } from '@app/components/feature/battle/v5/CombatResultDialog';
import { InkButton, InkDialog, InkNotice } from '@app/components/ui';
import type { SectOutcomeRendererProps } from '@app/lib/sect/presentation/core/registry';
import type {
  SectBattleOutcomeData,
  SectTaskRewardReceipt,
} from '@shared/contracts/sect';
import { useNavigate, useSearchParams } from 'react-router';
import {
  getSectPresentationForContext,
  useSectContextQuery,
} from './sectResources';
import { createSectRoomNpcHref } from './sectRoomNavigation';
import {
  createSectTaskBattleHref,
  getSectTaskActivityLocation,
  resolveSectTaskActivityOrigin,
} from './sectTaskActivityLocations';
import { useSectTaskInteraction } from './SectTaskInteractionProvider';

export function SweepSessionOutcome({
  task,
}: SectOutcomeRendererProps<unknown>) {
  const interaction = useSectTaskInteraction();
  return (
    <InkNotice className="mt-4">
      「{task.presentation.title}」勤务场已在山门开启。
      <InkButton
        variant="secondary"
        onClick={() =>
          interaction.navigate(
            createSectRoomNpcHref('/game/sect/gate', 'facility'),
          )
        }
      >
        前往山门
      </InkButton>
    </InkNotice>
  );
}

export function MiningSessionOutcome({
  task,
}: SectOutcomeRendererProps<unknown>) {
  const interaction = useSectTaskInteraction();
  return (
    <InkNotice className="mt-4">
      「{task.presentation.title}」采掘场已在灵脉开启。
      <InkButton
        variant="secondary"
        onClick={() =>
          interaction.navigate(
            createSectRoomNpcHref('/game/sect/spirit-vein', 'facility'),
          )
        }
      >
        前往灵脉
      </InkButton>
    </InkNotice>
  );
}

export function MiningResultOutcome({
  task,
  data,
}: SectOutcomeRendererProps<unknown>) {
  const result = data as {
    score: number;
    maxScore: number;
    tier?: string;
    qualified: boolean;
  };
  return (
    <InkNotice className="mt-4">
      「{task.presentation.title}」得分 {result.score}/{result.maxScore}
      {result.qualified ? `，评定为 ${result.tier} 档。` : '，尚未达到验收线。'}
    </InkNotice>
  );
}

export function CompletedOutcome({ task }: SectOutcomeRendererProps<unknown>) {
  const { clearOutcome } = useSectTaskInteraction();
  return (
    <InkDialog
      dialog={{
        id: `sect-task-${task.id}`,
        title: task.state === 'claimable' ? '委托回执已成' : '告示已经揭下',
        content: (
          <p className="text-sm leading-7">
            {task.state === 'claimable'
              ? '任务已经达成，赏赐尚未发放。请在告示榜领取结算。'
              : '委托已经登记，可按告示要求开始执行。'}
          </p>
        ),
        confirmLabel: '知道了',
        cancelLabel: null,
      }}
      onClose={clearOutcome}
    />
  );
}

export function RewardClaimedOutcome({
  task,
  data,
}: SectOutcomeRendererProps<unknown>) {
  const { clearOutcome } = useSectTaskInteraction();
  const receipt = data as SectTaskRewardReceipt;
  return (
    <InkDialog
      dialog={{
        id: `sect-task-reward-${receipt.taskRecordId}`,
        title: '委托已结清',
        content: (
          <div className="space-y-2 text-sm leading-7">
            <p className="font-semibold">{task.presentation.title}</p>
            {receipt.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p className="pt-2 text-stone-500">以上奖励已经入账</p>
          </div>
        ),
        confirmLabel: '收下赏赐',
        cancelLabel: null,
      }}
      onClose={clearOutcome}
    />
  );
}

export function BattleOutcome({
  task,
  data,
}: SectOutcomeRendererProps<unknown>) {
  const context = useSectContextQuery();
  const presentation = getSectPresentationForContext(context.data);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const attemptId = searchParams.get('attemptId') ?? 'unknown';
  const origin = resolveSectTaskActivityOrigin(searchParams.get('origin'));
  const returnTarget = origin
    ? getSectTaskActivityLocation(origin, task, 'return')
    : {
        route: '/game/sect/affairs',
        returnLabel: presentation.terms.returnToAffairs,
      };
  const battle = data as SectBattleOutcomeData;
  const playback = useBattlePlaybackState(battle.battle);
  const retry = () =>
    navigate(createSectTaskBattleHref(task.definitionId, origin), {
      replace: true,
    });
  return (
    <BattlePageLayout
      title={battle.challengeTitle}
      subtitle="任务封签已启，此局只用于核验任务结果。"
      variant="immersive-battle"
      battleResult={battle.battle}
    >
      <BattlePlaybackPanel
        battleResult={battle.battle}
        playback={playback}
        statusActions={[
          {
            label: returnTarget.returnLabel,
            onClick: () => navigate(returnTarget.route),
          },
        ]}
      />
      <CombatResultDialog
        key={`${attemptId}-${battle.battle.outcome.turns}`}
        dialogKey={`sect-task-${attemptId}`}
        open={playback.isPlaybackFinished}
        title={battle.won ? '宗门战局得胜' : '宗门战局失利'}
        confirmLabel={returnTarget.returnLabel}
        cancelLabel={battle.won ? '重看战局' : '重新挑战'}
        onConfirm={() => navigate(returnTarget.route)}
        onCancel={battle.won ? playback.reset : retry}
        content={
          <p className="leading-8">
            {battle.won
              ? battle.taskFulfilled
                ? origin
                  ? '胜绩回执已成，返回此地后便可回事务堂复命。'
                  : '胜绩回执已成，请回事务堂领取赏赐。'
                : '胜绩已经记入宗门卷宗。'
              : '此战未能击败对手，任务仍然保留，可整顿后再次挑战。'}
          </p>
        }
      />
    </BattlePageLayout>
  );
}
