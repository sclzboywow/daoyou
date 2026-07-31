import { useInkUI } from '@app/components/providers/InkUIProvider';
import type {
  TowerBlessingId,
  TowerEncounter,
  TowerSeasonMeta,
  TowerSettlement,
  TowerState,
} from '@shared/lib/tower';
import type { Cultivator } from '@shared/types/cultivator';
import { useState } from 'react';

interface TowerActionResponse {
  season: TowerSeasonMeta;
  state: TowerState;
  settlement?: TowerSettlement;
}

export interface TowerProbeResponse extends TowerActionResponse {
  battleId: string;
  encounter: TowerEncounter;
  enemy: Cultivator;
}

export function useTowerActions() {
  const { openDialog, pushToast } = useInkUI();
  const [processing, setProcessing] = useState(false);

  const startRun = async () => {
    try {
      setProcessing(true);
      const response = await fetch('/api/tower/start', { method: 'POST' });
      const data = (await response.json()) as TowerActionResponse & { error?: string };

      if (!response.ok || data.error) {
        throw new Error(data.error || '开启幻境失败');
      }

      pushToast({ message: '本周幻境已现', tone: 'success' });
      return data;
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '开启幻境失败',
        tone: 'danger',
      });
      return null;
    } finally {
      setProcessing(false);
    }
  };

  const probeBattle = async () => {
    try {
      setProcessing(true);
      const response = await fetch('/api/tower/battle/probe', { method: 'POST' });
      const data = (await response.json()) as TowerProbeResponse & { error?: string };

      if (!response.ok || data.error) {
        throw new Error(data.error || '照见幻影失败');
      }

      return data;
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '照见幻影失败',
        tone: 'danger',
      });
      return null;
    } finally {
      setProcessing(false);
    }
  };

  const chooseBlessing = async (blessingId: TowerBlessingId) => {
    try {
      setProcessing(true);
      const response = await fetch('/api/tower/blessing/choose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blessingId }),
      });
      const data = (await response.json()) as TowerActionResponse & { error?: string };

      if (!response.ok || data.error) {
        throw new Error(data.error || '祝福承接失败');
      }

      return data;
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '祝福承接失败',
        tone: 'danger',
      });
      return null;
    } finally {
      setProcessing(false);
    }
  };

  const resetRun = () =>
    new Promise<boolean>((resolve) => {
      openDialog({
        title: '重开本周幻境',
        content:
          '确定要舍去当前幻境进度，从第一重重新入境吗？本周已创下的榜单记录会保留。',
        confirmLabel: '重开幻境',
        cancelLabel: '取消',
        onConfirm: async () => {
          try {
            setProcessing(true);
            const response = await fetch('/api/tower/reset', { method: 'POST' });
            const data = (await response.json()) as { error?: string };
            if (!response.ok || data.error) {
              throw new Error(data.error || '重置失败');
            }

            pushToast({ message: '当前幻境进度已清空', tone: 'success' });
            resolve(true);
          } catch (error) {
            pushToast({
              message: error instanceof Error ? error.message : '重置失败',
              tone: 'danger',
            });
            resolve(false);
          } finally {
            setProcessing(false);
          }
        },
        onCancel: () => resolve(false),
      });
    });

  return {
    startRun,
    probeBattle,
    chooseBlessing,
    resetRun,
    processing,
  };
}
