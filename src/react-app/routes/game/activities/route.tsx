import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton } from '@app/components/ui';
import type { PlayerActivityView } from '@shared/contracts/adminPlatform';
import { useCallback, useEffect, useState } from 'react';

export default function PlayerActivitiesPage() {
  const { pushToast } = useInkUI();
  const [activities, setActivities] = useState<PlayerActivityView[]>([]);
  const load = useCallback(async () => {
    const response = await fetch('/api/activities', { cache: 'no-store' });
    const payload = await response.json();
    if (response.ok) setActivities(payload.activities ?? []);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const claim = async (id: string) => {
    const response = await fetch(`/api/activities/${id}/claim`, {
      method: 'POST',
    });
    const payload = await response.json();
    if (!response.ok) {
      pushToast({ message: payload.error ?? '领取失败', tone: 'danger' });
      return;
    }
    pushToast({
      message: payload.claimed ? '奖励已发送至传音玉简' : '奖励已领取过',
      tone: 'success',
    });
    await load();
  };
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4">
      <header className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <h1 className="font-heading text-3xl">仙盟活动</h1>
        <p className="text-ink-secondary mt-2 text-sm">查看当前公告与可领取的登录奖励。</p>
      </header>
      {activities.length === 0 ? <div className="border-ink/15 border border-dashed p-8 text-center">当前暂无进行中的活动</div> : activities.map((activity) => (
        <article key={activity.id} className="border-ink/15 bg-bgpaper/90 border border-dashed p-5">
          <h2 className="font-heading text-2xl">{activity.title}</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{activity.content}</p>
          {activity.rewardSummary.length > 0 ? <p className="text-gold mt-3 text-sm">奖励：{activity.rewardSummary.join('、')}</p> : null}
          {activity.activityType === 'login_reward' ? <div className="mt-4"><InkButton disabled={activity.claimed} onClick={() => void claim(activity.id)}>{activity.claimed ? '已领取' : '领取奖励'}</InkButton></div> : null}
        </article>
      ))}
    </div>
  );
}
