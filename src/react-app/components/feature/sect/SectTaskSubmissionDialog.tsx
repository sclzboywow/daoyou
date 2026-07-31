import { ItemSubmissionDialog } from '@app/components/feature/item-submission/ItemSubmissionDialog';
import { createItemSubmissionOptions } from '@app/components/feature/item-submission/itemSubmissionModel';
import { fetchSectSubmissionCandidates } from '@app/lib/sect/sectClient';
import type { SectTaskViewData } from '@shared/contracts/sect';
import { describeSectDeliveryRequirement } from '@shared/engine/sect';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SectTaskViewAction } from './SectTaskActions';
import { useSectTaskInteraction } from './SectTaskInteractionProvider';

export function SectTaskSubmissionDialog({
  open,
  task,
  action,
  onClose,
}: {
  open: boolean;
  task: SectTaskViewData;
  action: SectTaskViewAction;
  onClose(): void;
}) {
  if (!open) return null;
  return (
    <OpenSectTaskSubmissionDialog
      key={`${task.id}:${task.definitionId}`}
      task={task}
      action={action}
      onClose={onClose}
    />
  );
}

function OpenSectTaskSubmissionDialog({
  task,
  action,
  onClose,
}: {
  task: SectTaskViewData;
  action: SectTaskViewAction;
  onClose(): void;
}) {
  const pageSize = 30;
  const [page, setPage] = useState(1);
  const [data, setData] =
    useState<Awaited<ReturnType<typeof fetchSectSubmissionCandidates>>>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const { busy, execute } = useSectTaskInteraction();
  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setError(undefined);
      try {
        setData(
          await fetchSectSubmissionCandidates(
            task.definitionId,
            nextPage,
            pageSize,
          ),
        );
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '交付候选读取失败');
      } finally {
        setLoading(false);
      }
    },
    [task.definitionId],
  );
  useEffect(() => {
    void fetchSectSubmissionCandidates(task.definitionId, 1, pageSize).then(
      (result) => {
        setData(result);
        setLoading(false);
      },
      (reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '交付候选读取失败');
        setLoading(false);
      },
    );
  }, [task.definitionId]);
  const requirement = data?.requirement ?? task.requirement;
  const items = useMemo(
    () =>
      requirement
        ? createItemSubmissionOptions(data?.items ?? [], requirement.minQuality)
        : [],
    [data?.items, requirement],
  );

  if (!requirement) return null;
  return (
    <ItemSubmissionDialog
      open
      title={`移交 · ${task.presentation.title}`}
      requirement={describeSectDeliveryRequirement(requirement)}
      items={items}
      loading={loading}
      error={error}
      busy={busy}
      multiple={requirement.kind === 'material'}
      targetQuantity={requirement.quantity}
      pagination={
        data
          ? {
              page,
              pageSize: data.pageSize,
              total: data.total,
              onPageChange: (nextPage) => {
                setPage(nextPage);
                void load(nextPage);
              },
            }
          : undefined
      }
      onClose={onClose}
      onRetry={() => void load(page)}
      onConfirm={async (items) => {
        if (items.length === 0) return;
        const result = await execute(task, action, { items }, undefined);
        if (!result) return;
        const claimAction = result.primaryTask.actions.find(
          (candidate) => candidate.key === 'claim' && candidate.enabled,
        );
        if (result.primaryTask.state === 'claimable' && claimAction)
          await execute(
            result.primaryTask,
            claimAction,
            {},
            `「${task.presentation.title}」已经结清`,
          );
        onClose();
      }}
    />
  );
}
