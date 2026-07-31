import type { TowerBattleContext } from '@shared/lib/tower';
import { useEffect, useState } from 'react';

export function useTowerBattleContext(battleId: string | null) {
  const [resolvedState, setResolvedState] = useState<{
    battleId: string;
    context: TowerBattleContext | null;
    error?: string;
  }>();

  useEffect(() => {
    if (!battleId) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(
          `/api/tower/battle/context?battleId=${encodeURIComponent(battleId)}`,
        );
        const data = (await response.json()) as TowerBattleContext & {
          error?: string;
        };

        if (cancelled) return;
        if (!response.ok || data.error) {
          throw new Error(data.error || '读取幻境战局失败');
        }

        setResolvedState({
          battleId,
          context: data,
        });
      } catch (requestError) {
        if (cancelled) return;
        const error =
          requestError instanceof Error
            ? requestError.message
            : '读取幻境战局失败';
        setResolvedState({
          battleId,
          context: null,
          error,
        });
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [battleId]);

  const context =
    battleId && resolvedState?.battleId === battleId
      ? resolvedState.context
      : null;
  const error = !battleId
    ? '缺少幻境战局标识'
    : resolvedState?.battleId === battleId
      ? resolvedState.error
      : undefined;
  const loading = Boolean(battleId) && resolvedState?.battleId !== battleId;

  return {
    context,
    error,
    loading,
  };
}
