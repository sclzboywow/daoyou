import { BattlePageLayout } from '@app/components/feature/battle/BattlePageLayout';
import { BattlePlaybackPanel } from '@app/components/feature/battle/v3/BattlePlaybackPanel';
import { useBattlePlaybackState } from '@app/components/feature/battle/v3/useBattlePlaybackState';
import { GameImmersiveLoading } from '@app/components/game-shell';
import Link from '@app/components/router/AppLink';
import type { PublicBattleShareDetailV1 } from '@shared/types/battle';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';

type PublicBattleShareResponse = {
  success: boolean;
  data?: PublicBattleShareDetailV1;
  error?: string;
};

export default function PublicBattleReplayPage() {
  const { shareCode } = useParams<{ shareCode: string }>();
  const [record, setRecord] = useState<PublicBattleShareDetailV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const playback = useBattlePlaybackState(record?.battleResult);

  useEffect(() => {
    if (!shareCode) return;

    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/battle-records/shared/${shareCode}`,
          { cache: 'no-store', signal: controller.signal },
        );
        const payload = (await response.json()) as PublicBattleShareResponse;
        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.error || '战谱不存在');
        }
        setRecord(payload.data);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error ? loadError.message : '战谱加载失败',
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [shareCode]);

  if (!shareCode) {
    return (
      <div className="bg-paper flex min-h-[100svh] items-center justify-center px-4 py-20">
        <p className="text-ink">战谱不存在</p>
      </div>
    );
  }

  if (loading && !record) {
    return (
      <div className="bg-paper h-[100svh]">
        <GameImmersiveLoading message="正在展开公开战谱……" />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="bg-paper flex min-h-[100svh] items-center justify-center px-4 py-20">
        <div className="border-battle-rule-strong max-w-md border border-dashed bg-[rgba(248,243,230,0.92)] px-5 py-5 text-center">
          <p className="text-ink mb-2">{error || '战谱不存在'}</p>
          <p className="text-ink-secondary mb-4 text-sm leading-6">
            链接可能无效，或原始战绩已不存在。
          </p>
          <Link href="/game" className="text-ink hover:text-crimson">
            [进入万界道友]
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-paper h-[100svh] overflow-hidden">
      <BattlePageLayout
        title={`公开战谱 · ${playback.playerName} vs ${playback.opponentName}`}
        subtitle="此战谱仅公开战斗过程，不包含双方精确属性。"
        variant="immersive-battle"
        loading={loading}
        battleResult={record.battleResult}
      >
        <BattlePlaybackPanel
          battleResult={record.battleResult}
          playback={playback}
          statusActions={[{ label: '进入游戏', href: '/game' }]}
        />
      </BattlePageLayout>
    </div>
  );
}
