import { GameLoadingState } from '@app/components/game-shell/GameLoadingState';
import { InkButton } from '@app/components/ui/InkButton';
import type { BattlePlaybackRecordV3 } from '@shared/types/battle';
import type { CSSProperties, ReactNode } from 'react';

interface BattlePageLayoutProps {
  title: string;
  subtitle?: string;
  error?: string;
  loading?: boolean;
  battleResult?: BattlePlaybackRecordV3;
  children: ReactNode;
  variant?: 'page' | 'immersive-battle';
  actions?: {
    primary?: {
      label: string;
      onClick?: () => void;
      href?: string;
      disabled?: boolean;
    };
    secondary?: Array<{
      label: string;
      onClick?: () => void;
      href?: string;
      disabled?: boolean;
    }>;
  };
}

/**
 * 战斗页面布局组件：统一的页面结构和操作按钮
 */
export function BattlePageLayout({
  title,
  subtitle,
  error,
  loading,
  battleResult,
  children,
  variant = 'page',
  actions,
}: BattlePageLayoutProps) {
  if (variant === 'immersive-battle') {
    const immersiveLayoutStyle: CSSProperties = {
      paddingBottom:
        'calc(var(--battle-dock-height, calc(env(safe-area-inset-bottom) + 4.25rem)) + 0.6rem)',
    };

    return (
      <div
        className="h-full min-h-0 overflow-hidden"
        data-battle-layout-root="true"
      >
        <div
          className="main-content mx-auto box-border flex h-full min-h-0 max-w-4xl flex-col overflow-hidden pt-[calc(env(safe-area-inset-top)+0.7rem)] pr-[max(env(safe-area-inset-right),1rem)] pl-[max(env(safe-area-inset-left),1rem)] md:pt-[calc(env(safe-area-inset-top)+0.95rem)] md:pr-[max(env(safe-area-inset-right),1.5rem)] md:pl-[max(env(safe-area-inset-left),1.5rem)]"
          style={immersiveLayoutStyle}
        >
          {error && (
            <div className="border-crimson bg-crimson/6 mb-4 border-l-2 px-4 py-3">
              <p className="text-crimson text-sm leading-7">{error}</p>
            </div>
          )}

          {loading && !battleResult ? (
            <GameLoadingState
              message="正在加载战斗……"
              variant="immersive"
              className="flex-1"
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="battle-scroll h-full overflow-y-auto">
      <div className="main-content mx-auto flex min-h-full max-w-4xl flex-col pt-[calc(env(safe-area-inset-top)+4.25rem)] pr-[max(env(safe-area-inset-right),1rem)] pb-64 pl-[max(env(safe-area-inset-left),1rem)] md:pt-[calc(env(safe-area-inset-top)+4.6rem)] md:pr-[max(env(safe-area-inset-right),1.5rem)] md:pb-68 md:pl-[max(env(safe-area-inset-left),1.5rem)]">
        <header className="mb-3">
          <div className="min-w-0">
            <h1 className="font-heading text-ink text-3xl leading-none md:text-4xl">
              {title}
            </h1>
            {subtitle && (
              <p className="text-battle-muted mt-1.5 max-w-2xl text-sm leading-7 md:text-base">
                {subtitle}
              </p>
            )}
          </div>
        </header>

        {error && (
          <div className="border-crimson bg-crimson/6 mb-6 border-l-2 px-4 py-3">
            <p className="text-crimson text-sm leading-7">{error}</p>
          </div>
        )}

        <div className="flex-1">{children}</div>

        {battleResult && actions && variant === 'page' && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {actions.secondary?.map((action, index) => (
              <InkButton
                key={index}
                onClick={action.onClick}
                href={action.href}
                disabled={action.disabled}
              >
                {action.label}
              </InkButton>
            ))}
            {actions.primary && (
              <InkButton
                onClick={actions.primary.onClick}
                href={actions.primary.href}
                variant="primary"
                disabled={actions.primary.disabled}
              >
                {actions.primary.label}
              </InkButton>
            )}
          </div>
        )}

        {loading && !battleResult && (
          <GameLoadingState message="正在加载战斗……" variant="inline" />
        )}
      </div>
    </div>
  );
}
