import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton } from '@app/components/ui';
import type {
  AdminOperationsResponse,
  AdminOperationsSnapshot,
} from '@shared/contracts/adminOperations';
import { useCallback, useEffect, useRef, useState } from 'react';

async function fetchSnapshot(): Promise<AdminOperationsSnapshot> {
  const response = await fetch('/api/admin/operations', { cache: 'no-store' });
  const payload = (await response.json()) as
    | AdminOperationsResponse
    | { success?: false; error?: string };
  if (!response.ok || !payload.success || !('data' in payload)) {
    throw new Error(
      'error' in payload ? payload.error ?? '加载运营数据失败' : '加载运营数据失败',
    );
  }
  return payload.data;
}

function MetricCard(props: {
  title: string;
  value: number | string;
  hint: string;
  warning?: boolean;
}) {
  return (
    <div
      className={
        props.warning
          ? 'border-crimson/40 bg-crimson/5 border border-dashed p-5'
          : 'border-ink/15 bg-bgpaper/85 border border-dashed p-5'
      }
    >
      <p className="text-ink-secondary text-xs tracking-[0.18em]">
        {props.title}
      </p>
      <p className="text-ink mt-3 text-3xl font-semibold tabular-nums">
        {props.value}
      </p>
      <p className="text-ink-secondary mt-2 text-xs leading-6">{props.hint}</p>
    </div>
  );
}

function ratio(value: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

export default function AdminOperationsPage() {
  const { pushToast } = useInkUI();
  const [snapshot, setSnapshot] = useState<AdminOperationsSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setSnapshot(await fetchSnapshot());
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '加载运营数据失败',
        tone: 'danger',
      });
    } finally {
      setRefreshing(false);
    }
  }, [pushToast]);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    void loadRef.current();
  }, []);

  const shortageCells =
    snapshot?.materials.cells.filter((cell) => cell.deficit > 0) ?? [];

  return (
    <div className="space-y-6">
      <header className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <p className="text-ink-secondary text-xs tracking-[0.22em]">
          OPERATIONS
        </p>
        <h2 className="font-heading text-ink mt-2 text-3xl">运营数据</h2>
        <p className="text-ink-secondary mt-3 max-w-3xl text-sm leading-7">
          聚合玩家活跃、新手任务、邮件领取、玩法参与、经济存量与道具库覆盖。
          近 24 小时指标以页面生成时间向前滚动计算。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <InkButton
            type="button"
            variant="secondary"
            disabled={refreshing}
            onClick={() => void load()}
          >
            {refreshing ? '刷新中...' : '刷新'}
          </InkButton>
          <span className="text-ink-secondary text-xs">
            最近生成：
            {snapshot ? new Date(snapshot.generatedAt).toLocaleString() : '暂无'}
          </span>
        </div>
      </header>

      {!snapshot?.security.turnstileEnabled ? (
        <section className="border-crimson/40 bg-crimson/5 border border-dashed p-5">
          <h3 className="text-ink text-lg font-semibold">人机验证尚未启用</h3>
          <p className="text-ink-secondary mt-2 text-sm leading-7">
            服务器未检测到有效的 Turnstile 私钥。配置前后端密钥并重新构建客户端后，
            登录和找回密码才会执行人机验证。
          </p>
        </section>
      ) : null}

      <section className="space-y-4">
        <h3 className="text-ink text-xl font-semibold">玩家与活跃</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard
            title="活跃角色"
            value={snapshot?.players.total ?? 0}
            hint="当前状态为 active 的角色"
          />
          <MetricCard
            title="24 小时活跃"
            value={snapshot?.players.active24h ?? 0}
            hint="按角色最后活跃时间去重"
          />
          <MetricCard
            title="7 日活跃"
            value={snapshot?.players.active7d ?? 0}
            hint="用于观察近期玩家基数"
          />
        </div>
        <div className="border-ink/15 bg-bgpaper/90 border border-dashed p-5">
          <p className="text-ink-secondary text-xs tracking-[0.18em]">
            境界分布
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {snapshot?.players.realms.map((row) => (
              <span
                key={`${row.realm}:${row.stage}`}
                className="border-ink/15 bg-bgpaper border border-dashed px-3 py-2 text-sm"
              >
                {row.realm}
                {row.stage}：{row.count}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-ink text-xl font-semibold">新手任务漏斗</h3>
        <div className="overflow-x-auto border border-dashed border-ink/15 bg-bgpaper/90">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-ink/15 border-b">
              <tr>
                <th className="p-4">任务</th>
                <th className="p-4">已接取</th>
                <th className="p-4">已完成</th>
                <th className="p-4">奖励邮件已发送</th>
              </tr>
            </thead>
            <tbody>
              {snapshot?.tutorials.map((task) => (
                <tr key={task.definitionId} className="border-ink/10 border-b">
                  <td className="p-4 font-medium">{task.title}</td>
                  <td className="p-4 tabular-nums">{task.assigned}</td>
                  <td className="p-4 tabular-nums">
                    {task.completed}（{ratio(task.completed, task.assigned)}）
                  </td>
                  <td className="p-4 tabular-nums">
                    {task.rewardSent}（{ratio(task.rewardSent, task.assigned)}）
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-ink text-xl font-semibold">近 24 小时与经济</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="秘境完成"
            value={snapshot?.gameplay24h.dungeonRuns ?? 0}
            hint={`${snapshot?.gameplay24h.dungeonPlayers ?? 0} 名不同玩家`}
          />
          <MetricCard
            title="宗门任务完成"
            value={snapshot?.gameplay24h.sectTasksCompleted ?? 0}
            hint="近 24 小时完成记录"
          />
          <MetricCard
            title="宗门宝库兑换"
            value={snapshot?.economy.sectShopPurchases24h ?? 0}
            hint="近 24 小时购买次数"
          />
          <MetricCard
            title="声望宝阁兑换"
            value={snapshot?.economy.reputationShopPurchases24h ?? 0}
            hint="近 24 小时购买次数"
          />
          <MetricCard
            title="全服灵石"
            value={(snapshot?.economy.totalSpiritStones ?? 0).toLocaleString()}
            hint="所有活跃角色当前存量"
          />
          <MetricCard
            title="全服声望"
            value={(snapshot?.economy.totalReputation ?? 0).toLocaleString()}
            hint="所有活跃角色当前存量"
          />
          <MetricCard
            title="全服宗门贡献"
            value={(
              snapshot?.economy.totalSectContribution ?? 0
            ).toLocaleString()}
            hint="活跃宗门成员当前存量"
          />
          <MetricCard
            title="待投递事务"
            value={snapshot?.delivery.pendingTransactionMessages ?? 0}
            hint="正常应长期保持为 0"
            warning={(snapshot?.delivery.pendingTransactionMessages ?? 0) > 0}
          />
          <MetricCard
            title="未读邮件"
            value={snapshot?.mail.unread ?? 0}
            hint="全服玩家当前未读邮件"
          />
          <MetricCard
            title="未领邮件奖励"
            value={snapshot?.mail.unclaimedRewards ?? 0}
            hint="含附件且尚未领取"
            warning={(snapshot?.mail.unclaimedRewards ?? 0) > 0}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-ink text-xl font-semibold">材料库覆盖</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard
            title="已发布材料"
            value={snapshot?.materials.published ?? 0}
            hint="当前可参与抽样的材料模板"
          />
          <MetricCard
            title="缺口格子"
            value={snapshot?.materials.deficientCells ?? 0}
            hint="类别 × 品质未达到运营目标"
            warning={(snapshot?.materials.deficientCells ?? 0) > 0}
          />
          <MetricCard
            title="待补材料"
            value={snapshot?.materials.totalDeficit ?? 0}
            hint="所有格子的目标数量缺口合计"
            warning={(snapshot?.materials.totalDeficit ?? 0) > 0}
          />
        </div>
        {shortageCells.length > 0 ? (
          <div className="border-crimson/30 bg-crimson/5 border border-dashed p-5">
            <p className="text-ink font-medium">仍需补充</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {shortageCells.map((cell) => (
                <span
                  key={`${cell.materialType}:${cell.quality}`}
                  className="border-crimson/25 bg-bgpaper border border-dashed px-3 py-2 text-xs"
                >
                  {cell.materialType} · {cell.quality}：{cell.current}/
                  {cell.target}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="border-ink/15 bg-bgpaper/90 border border-dashed p-5 text-sm">
            所有材料格子均达到运营目标。
          </div>
        )}
      </section>
    </div>
  );
}
