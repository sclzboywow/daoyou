import { InkButton } from '@app/components/ui';
import { useNavigate } from 'react-router';
import { useSectTasksQuery } from './sectResources';
import {
  createSectTaskBattleHref,
  readSectTaskActivityLocation,
  type SectTaskActivityLocationKey,
} from './sectTaskActivityLocations';

export function SectTaskActivityEntry({
  locationKey,
  activeMessage,
}: {
  locationKey: SectTaskActivityLocationKey;
  activeMessage: string;
}) {
  const navigate = useNavigate();
  const { data } = useSectTasksQuery();

  const task = data?.items.find(
    (candidate) =>
      (candidate.state === 'active' || candidate.state === 'claimable') &&
      candidate.actions.some(
        (action) => readSectTaskActivityLocation(action)?.key === locationKey,
      ),
  );
  if (!task) return null;

  const battleAction = task.actions.find(
    (action) =>
      action.renderer === 'sect.action.battle' &&
      readSectTaskActivityLocation(action)?.key === locationKey,
  );

  return (
    <section
      aria-live="polite"
      className="border-crimson/40 bg-crimson/[0.035] mb-5 border-l-2 px-5 py-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="min-w-0 text-sm leading-7">
          <strong className="mr-2 font-medium">
            {task.presentation.title}
          </strong>
          {task.state === 'claimable'
            ? '胜绩回执已经写成，该回事务堂复命了。'
            : activeMessage}
        </p>
        {task.state === 'claimable' ? (
          <InkButton
            variant="primary"
            onClick={() => navigate('/game/sect/affairs')}
          >
            回事务堂复命
          </InkButton>
        ) : battleAction?.enabled ? (
          <InkButton
            variant="primary"
            onClick={() =>
              navigate(createSectTaskBattleHref(task.definitionId, locationKey))
            }
          >
            {battleAction.label}
          </InkButton>
        ) : null}
      </div>
    </section>
  );
}
