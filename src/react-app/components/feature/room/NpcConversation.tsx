import { cn } from '@shared/lib/cn';
import type { ReactNode } from 'react';
import type { RoomActorAppearance } from './RoomView';

export interface NpcConversationActor {
  sigil: string;
  name: string;
  identity: string;
  responsibility: string;
  appearance?: RoomActorAppearance;
}

export interface NpcConversationMessage {
  id: string;
  speaker?: string;
  body: ReactNode;
  tone?: 'normal' | 'muted' | 'attention';
}

export interface NpcConversationOption {
  id: string;
  label: string;
  tone?: 'normal' | 'primary' | 'muted';
  disabled?: boolean;
}

export interface NpcConversationProps {
  actor: NpcConversationActor;
  messages: readonly NpcConversationMessage[];
  options?: readonly NpcConversationOption[];
  selectedOptionId?: string;
  busy?: boolean;
  error?: string;
  children?: ReactNode;
  actions?: ReactNode;
  onSelectOption?(optionId: string): void;
}

const messageToneClass = {
  normal: 'text-ink',
  muted: 'text-ink-secondary',
  attention: 'text-crimson',
} as const;

export function NpcConversation({
  actor,
  messages,
  options = [],
  selectedOptionId,
  busy = false,
  error,
  children,
  actions,
  onSelectOption,
}: NpcConversationProps) {
  const appearance = actor.appearance ?? 'person';
  return (
    <div className="grid min-h-[34rem] md:grid-cols-[13rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="border-ink/10 bg-ink/[0.025] flex items-center gap-4 border-b px-5 py-4 md:flex-col md:justify-start md:border-r md:border-b-0 md:px-6 md:pt-14 md:text-center">
        <span
          aria-hidden="true"
          className={cn(
            'text-ink w-16 shrink-0 text-center leading-none md:w-auto',
            appearance === 'facility'
              ? 'text-[3rem] md:text-[4.5rem]'
              : 'font-heading text-[3.75rem] md:text-[5.75rem]',
          )}
        >
          {actor.sigil}
        </span>
        <div>
          <h2 className="text-ink text-lg font-normal md:mt-4 md:text-xl">
            {actor.name}
          </h2>
          <p className="text-ink-secondary mt-1 text-sm">{actor.identity}</p>
          <p className="text-ink-secondary mt-2 max-w-36 text-xs leading-5">
            {actor.responsibility}
          </p>
        </div>
      </aside>

      <div className="min-w-0 px-5 py-7 sm:px-8 md:px-10 md:py-10">
        <div
          aria-live="polite"
          aria-busy={busy}
          className="space-y-4 sm:space-y-5"
        >
          {messages.map((message) => (
            <p
              key={message.id}
              className={cn(
                'text-base leading-8 sm:text-lg sm:leading-9',
                messageToneClass[message.tone ?? 'normal'],
              )}
            >
              {message.speaker && appearance === 'person' ? (
                <>
                  <span className="sr-only">{message.speaker}：</span>
                  <span aria-hidden="true">“</span>
                  {message.body}
                  <span aria-hidden="true">”</span>
                </>
              ) : (
                message.body
              )}
            </p>
          ))}
          {error ? (
            <p className="text-crimson text-sm leading-7">{error}</p>
          ) : null}
        </div>

        {children ? <div className="mt-5">{children}</div> : null}

        {actions ? (
          <div className="[&>button]:border-crimson/45 [&>button]:bg-crimson/6 [&>button]:hover:bg-crimson/10 [&>button]:focus-visible:outline-crimson mt-5 space-y-2 [&>button]:w-full [&>button]:justify-start [&>button]:border-l-2 [&>button]:px-5 [&>button]:py-3 [&>button]:text-left [&>button]:text-base [&>button]:focus-visible:outline-2 [&>button]:focus-visible:outline-offset-[-2px]">
            {actions}
          </div>
        ) : null}

        {options.length > 0 ? (
          <div className="mt-3 space-y-2">
            {options.map((option) => {
              const selected = option.id === selectedOptionId;
              const tone = option.tone ?? 'normal';
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={busy || option.disabled}
                  aria-pressed={
                    selectedOptionId === undefined ? undefined : selected
                  }
                  onClick={() => onSelectOption?.(option.id)}
                  className={cn(
                    'border-ink/15 bg-ink/[0.025] focus-visible:outline-crimson flex w-full cursor-pointer items-start border-l-2 px-5 py-3 text-left transition-colors enabled:hover:border-crimson/45 enabled:hover:bg-crimson/6 enabled:hover:text-crimson focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
                    tone === 'primary'
                      ? 'text-crimson'
                      : tone === 'muted'
                        ? 'text-ink-secondary'
                        : 'text-ink',
                    selected && 'border-crimson/45 bg-crimson/6 text-crimson',
                    (busy || option.disabled) &&
                      'cursor-not-allowed opacity-50',
                  )}
                >
                  <span className="block text-base">{option.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
