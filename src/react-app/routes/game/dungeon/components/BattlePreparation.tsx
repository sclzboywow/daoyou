import { CultivatorInspectionModal } from '@app/components/feature/cultivator-inspection';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton } from '@app/components/ui/InkButton';
import { InkCard } from '@app/components/ui/InkCard';
import {
  DungeonAbandonBattleResult,
  useEnemyProbe,
} from '@app/lib/hooks/dungeon/useEnemyProbe';
import { evaluateBattlePreparationRisk } from '@app/lib/dungeon/battlePreparationRisk';
import type { Cultivator } from '@shared/types/cultivator';
import { useEffect, useState } from 'react';

interface BattlePreparationProps {
  battleId: string;
  player: Pick<Cultivator, 'realm' | 'attributes'>;
  onStart: (enemyName: string) => void;
  onAbandon: (result: DungeonAbandonBattleResult) => Promise<void>;
}

export function BattlePreparation({
  battleId,
  player,
  onStart,
  onAbandon,
}: BattlePreparationProps) {
  const { openDialog } = useInkUI();
  const { enemy, isProbing, probeEnemy, abandonBattle } =
    useEnemyProbe(battleId);
  const [isEnemyDetailOpen, setIsEnemyDetailOpen] = useState(false);

  useEffect(() => {
    if (!enemy && !isProbing) {
      probeEnemy();
    }
  }, [battleId, enemy, isProbing, probeEnemy]);

  const handleProbe = () => {
    if (enemy) {
      setIsEnemyDetailOpen(true);
    }
  };

  const handleAbandon = () => {
    openDialog({
      title: '放弃战斗',
      content:
        '确定要放弃此战吗？你将狼狈退出，但不会受伤。放弃后会直接进入副本结算。',
      confirmLabel: '确认放弃',
      cancelLabel: '取消',
      onConfirm: async () => {
        const result = await abandonBattle();
        if (result) {
          await onAbandon(result);
        }
      },
    });
  };

  const battleRisk = evaluateBattlePreparationRisk(player, enemy);

  const startBattle = () => {
    const enemyName = enemy?.title
      ? `${enemy.title}·${enemy.name}`
      : enemy?.name || '神秘敌手';

    onStart(enemyName);
  };

  const handleStart = () => {
    if (!battleRisk.shouldWarn) {
      startBattle();
      return;
    }

    openDialog({
      title: '强敌压境',
      content: battleRisk.message,
      confirmLabel: '仍要开战',
      cancelLabel: '先撤退',
      onConfirm: startBattle,
    });
  };

  return (
    <InkCard className="space-y-6 p-6">
      <div className="space-y-4 text-center">
        <div className="animate-bounce text-6xl">⚔️</div>
        <div>
          <h2 className="text-crimson mb-2 text-2xl font-bold">遭遇强敌</h2>
          {enemy ? (
            <p className="text-ink text-lg">
              前方发现了{' '}
              <span className="font-bold">
                {enemy.title ? `${enemy.title}·${enemy.name}` : enemy.name}
              </span>
            </p>
          ) : (
            <p className="text-ink animate-pulse text-lg">
              正在感知敌人气息...
            </p>
          )}
          <p className="text-ink-secondary mt-2 text-sm">
            此战避无可避，当速决断！
          </p>
          <p className="text-wood mt-3 text-sm leading-6">
            新手先点“神识查探”再决定。若属性差距明显，撤退不会受伤；强行战败会结束本轮探秘。
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <InkButton
          variant="secondary"
          className="w-full py-3"
          onClick={handleProbe}
          disabled={!enemy}
        >
          {enemy ? '👁️ 神识查探' : '查探中...'}
        </InkButton>

        <InkButton
          variant={battleRisk.shouldWarn ? 'secondary' : 'primary'}
          className="w-full py-4 text-lg"
          onClick={handleStart}
          disabled={!enemy}
        >
          {battleRisk.shouldWarn ? '⚠️ 强敌当前，建议撤退' : '⚔️ 开始战斗'}
        </InkButton>

        <InkButton
          variant="ghost"
          className="text-ink-secondary hover:text-crimson w-full py-2"
          onClick={handleAbandon}
        >
          🏃 放弃战斗（撤退）
        </InkButton>
      </div>

      <CultivatorInspectionModal
        cultivator={enemy}
        isOpen={isEnemyDetailOpen}
        onClose={() => setIsEnemyDetailOpen(false)}
        mode="enemy"
      />
    </InkCard>
  );
}
