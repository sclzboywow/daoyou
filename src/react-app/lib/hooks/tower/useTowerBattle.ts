import { useInkUI } from '@app/components/providers/InkUIProvider';
import { consumeResourceMutation } from '@app/lib/resources/mutations';
import type {
  TowerMilestoneReward,
  TowerSettlement,
  TowerState,
} from '@shared/lib/tower';
import type { BattleRecordV3 } from '@shared/types/battle';
import { useCallback, useState } from 'react';

export interface TowerBattleCallbackData {
  towerState: TowerState;
  isFinished: boolean;
  settlement?: TowerSettlement;
  milestoneReward?: TowerMilestoneReward;
}

type TowerBattlePayload = {
  battleResult?: BattleRecordV3;
  callbackData?: TowerBattleCallbackData;
};

export function useTowerBattle() {
  const { pushToast } = useInkUI();
  const [battleResult, setBattleResult] = useState<BattleRecordV3>();
  const [loading, setLoading] = useState(false);

  const executeBattle = useCallback(
    async (battleId: string) => {
      try {
        setLoading(true);
        setBattleResult(undefined);

        const response = await fetch('/api/tower/battle/execute/v5', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ battleId }),
        });
        const data = await consumeResourceMutation<TowerBattlePayload>(
          response,
        );

        if (!data.battleResult || !data.callbackData) {
          throw new Error('幻境战局异常中断');
        }

        setBattleResult(data.battleResult);
        return {
          battleResult: data.battleResult,
          callbackData: data.callbackData,
        };
      } catch (error) {
        pushToast({
          message: error instanceof Error ? error.message : '幻境战局异常中断',
          tone: 'danger',
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [pushToast],
  );

  return {
    battleResult,
    loading,
    executeBattle,
  };
}
