import type {
  TowerLeaderboardEntry,
  TowerSeasonMeta,
} from '@shared/lib/tower';
import type { RealmType } from '@shared/types/constants';
import { useEffect, useState } from 'react';

export interface TowerLeaderboardPayload {
  season: TowerSeasonMeta;
  realm: RealmType;
  entries: TowerLeaderboardEntry[];
}

export function useTowerLeaderboard(
  hasCultivator: boolean,
  realm: RealmType,
  limit = 30,
) {
  const [payload, setPayload] = useState<TowerLeaderboardPayload | null>(null);
  const [loading, setLoading] = useState(hasCultivator);

  useEffect(() => {
    if (!hasCultivator) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/tower/leaderboard?realm=${encodeURIComponent(realm)}&limit=${limit}`,
        );
        const data = (await response.json()) as TowerLeaderboardPayload & {
          error?: string;
        };

        if (cancelled) return;
        if (!response.ok || data.error) {
          throw new Error(data.error || '获取塔榜失败');
        }

        setPayload(data);
      } catch {
        if (cancelled) return;
        setPayload(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [hasCultivator, limit, realm]);

  return {
    payload: hasCultivator ? payload : null,
    loading: hasCultivator ? loading : false,
  };
}
