import { InkButton } from '@app/components/ui';
import type { SectTaskViewData } from '@shared/contracts/sect';
import { useState } from 'react';
import { createSectRoomNpcHref } from './sectRoomNavigation';
import {
  createSectTaskBattleHref,
  getSectTaskActivityLocation,
  readSectTaskActivityLocation,
} from './sectTaskActivityLocations';
import { useSectTaskInteraction } from './SectTaskInteractionProvider';
import { SectTaskSubmissionDialog } from './SectTaskSubmissionDialog';

export type SectTaskViewAction = SectTaskViewData['actions'][number];

export interface SectTaskActionRendererProps {
  task: SectTaskViewData;
  action: SectTaskViewAction;
  display?: 'default' | 'conversation';
}

const conversationActionClass =
  'w-full cursor-pointer justify-start border-l-2 border-crimson/45 bg-crimson/6 px-5 py-3 text-left text-base hover:bg-crimson/10 focus-visible:outline-crimson focus-visible:outline-2 focus-visible:outline-offset-[-2px]';

function actionClassName(display: SectTaskActionRendererProps['display']) {
  return display === 'conversation' ? conversationActionClass : undefined;
}

export function AcceptAction({
  task,
  action,
  display,
}: SectTaskActionRendererProps) {
  const { busy, execute } = useSectTaskInteraction();
  return (
    <InkButton
      variant="primary"
      className={actionClassName(display)}
      disabled={busy || !action.enabled}
      onClick={() =>
        void execute(task, action, {}, `已接下「${task.presentation.title}」`)
      }
    >
      {action.enabled
        ? display === 'conversation'
          ? task.presentation.dialogue.offeredReply
          : action.label
        : (action.disabledReason ?? '尚未解锁')}
    </InkButton>
  );
}

export function ClaimAction({
  task,
  action,
  display,
}: SectTaskActionRendererProps) {
  const { busy, execute } = useSectTaskInteraction();
  return (
    <InkButton
      variant="primary"
      className={actionClassName(display)}
      disabled={busy || !action.enabled}
      onClick={() =>
        void execute(task, action, {}, `「${task.presentation.title}」已结清`)
      }
    >
      {action.enabled
        ? display === 'conversation'
          ? '请执事结清此事'
          : action.label
        : (action.disabledReason ?? '尚未解锁')}
    </InkButton>
  );
}

export function BattleAction({
  task,
  action,
  display,
}: SectTaskActionRendererProps) {
  const { busy, navigate } = useSectTaskInteraction();
  const activityLocation = readSectTaskActivityLocation(action);
  return (
    <InkButton
      variant="primary"
      className={actionClassName(display)}
      disabled={busy || !action.enabled}
      onClick={() => {
        if (display === 'conversation' && activityLocation) {
          navigate(
            getSectTaskActivityLocation(activityLocation.key, task).route,
          );
          return;
        }
        navigate(
          createSectTaskBattleHref(task.definitionId, activityLocation?.key),
        );
      }}
    >
      {action.enabled
        ? display === 'conversation'
          ? (activityLocation?.travelReply ?? '我这就去应战')
          : action.label
        : (action.disabledReason ?? '尚未解锁')}
    </InkButton>
  );
}

export function SweepEntryAction({
  action,
  display,
}: SectTaskActionRendererProps) {
  const { busy, navigate } = useSectTaskInteraction();
  return (
    <InkButton
      variant="primary"
      className={actionClassName(display)}
      disabled={busy || !action.enabled}
      onClick={() =>
        navigate(createSectRoomNpcHref('/game/sect/gate', 'facility'))
      }
    >
      {action.enabled
        ? display === 'conversation'
          ? '我这就去办'
          : action.label
        : (action.disabledReason ?? '尚未解锁')}
    </InkButton>
  );
}

export function MiningEntryAction({
  action,
  display,
}: SectTaskActionRendererProps) {
  const { busy, navigate } = useSectTaskInteraction();
  return (
    <InkButton
      variant="primary"
      className={actionClassName(display)}
      disabled={busy || !action.enabled}
      onClick={() =>
        navigate(createSectRoomNpcHref('/game/sect/spirit-vein', 'facility'))
      }
    >
      {action.enabled
        ? display === 'conversation'
          ? '我这就去灵脉采掘'
          : action.label
        : (action.disabledReason ?? '尚未解锁')}
    </InkButton>
  );
}

export function ItemDeliveryAction(props: SectTaskActionRendererProps) {
  const [open, setOpen] = useState(false);
  const { busy } = useSectTaskInteraction();
  return (
    <>
      <InkButton
        variant="primary"
        className={actionClassName(props.display)}
        disabled={busy || !props.action.enabled}
        onClick={() => setOpen(true)}
      >
        {props.action.enabled
          ? props.display === 'conversation'
            ? '东西已经备好，请替我查验'
            : props.action.label
          : (props.action.disabledReason ?? '尚未解锁')}
      </InkButton>
      <SectTaskSubmissionDialog
        open={open}
        task={props.task}
        action={props.action}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
