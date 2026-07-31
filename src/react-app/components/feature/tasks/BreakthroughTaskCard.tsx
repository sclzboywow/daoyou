import { InkButton } from '@app/components/ui/InkButton';
import { cn } from '@shared/lib/cn';
import type { TaskInstance } from '@shared/types/task';

function StatusPill({
  text,
  tone,
}: {
  text: string;
  tone: 'ready' | 'pending';
}) {
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-[11px] tracking-[0.08em]',
        tone === 'ready'
          ? 'border-emerald-700/25 bg-emerald-50 text-emerald-800'
          : 'border-amber-700/25 bg-amber-50 text-amber-900',
      )}
    >
      {text}
    </span>
  );
}

export function BreakthroughTaskCard({
  task,
  className,
}: {
  task: TaskInstance;
  className?: string;
}) {
  const currentStage = task.snapshot.stages.find((stage) => stage.current) ?? null;
  const fromRealm = task.snapshot.fromRealm ?? task.metadata.fromRealm ?? null;
  const toRealm = task.snapshot.toRealm ?? task.metadata.toRealm ?? null;
  const transitionText =
    fromRealm && toRealm ? `${fromRealm} → ${toRealm}` : task.snapshot.title;

  if (task.status === 'completed' || !currentStage) {
    return (
      <div
        className={cn(
          'space-y-4 border border-dashed border-ink/8 bg-[rgba(248,243,230,0.6)] p-4',
          className,
        )}
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold tracking-[0.04em] text-ink">
              可回静室冲关
            </p>
            <StatusPill text="前置已成" tone="ready" />
          </div>
          <p className="text-sm leading-7 text-ink-secondary">
            这一份破境卷宗已经办妥，现在可以回静室正式冲击
            {toRealm ?? '下一重境界'}。
          </p>
        </div>

        <div className="space-y-1 text-xs text-ink-secondary">
          <p>{task.snapshot.title}</p>
          <p>{transitionText}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <InkButton href="/game/retreat">回静室冲关</InkButton>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'space-y-4 border border-dashed border-ink/10 bg-[rgba(248,243,230,0.82)] p-4',
        className,
      )}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-semibold tracking-[0.04em] text-ink">
            {currentStage.title}
          </p>
          <StatusPill text="仍在筹备" tone="pending" />
        </div>
        <p className="text-sm leading-7 text-ink-secondary">
          {currentStage.description}
        </p>
        <div className="space-y-1 text-xs text-ink-secondary">
          <p>{task.snapshot.title}</p>
          <p>{transitionText}</p>
        </div>
      </div>

      <div className="space-y-2 text-sm leading-7">
        {currentStage.objectives.map((objective) => (
          <div key={objective.id} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-ink">{objective.title}</p>
              <p className="text-xs leading-6 text-ink-secondary">
                {objective.progressText}
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 text-xs',
                objective.completed ? 'text-emerald-700' : 'text-ink-secondary',
              )}
            >
              {objective.completed ? '已成' : '待办'}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {currentStage.links.map((link) => (
          <InkButton key={`${task.id}:${link.href}:${link.label}`} href={link.href}>
            {link.label}
          </InkButton>
        ))}
      </div>
    </div>
  );
}
