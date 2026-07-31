import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton, InkInput, InkSelect } from '@app/components/ui';
import type {
  AdminActivityType,
  AdminActivityView,
} from '@shared/contracts/adminPlatform';
import { REALM_VALUES } from '@shared/types/constants';
import { useCallback, useEffect, useState } from 'react';
import { RewardSelectionEditor } from '../_components/RewardSelectionEditor';
import {
  parseRewardSelectionDrafts,
  type RewardSelectionDraft,
} from '../_components/RewardSelectionEditor.helpers';

function defaultStart() {
  const date = new Date(Date.now() + 5 * 60_000);
  date.setSeconds(0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export default function AdminActivitiesPage() {
  const { pushToast } = useInkUI();
  const [activities, setActivities] = useState<AdminActivityView[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<AdminActivityType>('login_reward');
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState('');
  const [realmMin, setRealmMin] = useState('');
  const [realmMax, setRealmMax] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');
  const [redeemCode, setRedeemCode] = useState('');
  const [totalLimit, setTotalLimit] = useState('');
  const [rewards, setRewards] = useState<RewardSelectionDraft[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch('/api/admin/activities', {
      cache: 'no-store',
    });
    const payload = await response.json();
    if (response.ok) setActivities(payload.activities ?? []);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const saveDraft = async () => {
    try {
      const rewardSelections = parseRewardSelectionDrafts(rewards, {
        allowEmpty: type === 'announcement' || type === 'game_mail',
      });
      const config =
        type === 'announcement'
          ? { kind: type, title, content }
          : type === 'game_mail'
            ? { kind: type, title, content, rewardSelections }
            : type === 'redeem_code'
              ? {
                  kind: type,
                  code: redeemCode || undefined,
                  mailTitle: title,
                  mailContent: content,
                  totalLimit: totalLimit ? Number(totalLimit) : undefined,
                  rewardSelections,
                }
              : {
                  kind: type,
                  description,
                  mailTitle: title,
                  mailContent: content,
                  rewardSelections,
                };
      const response = await fetch(
        editingId
          ? `/api/admin/activities/${editingId}`
          : '/api/admin/activities',
        {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          name,
          activityType: type,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          audience: {
            realmMin: realmMin || undefined,
            realmMax: realmMax || undefined,
          },
          config,
        }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? '保存失败');
      pushToast({ message: '活动草稿已保存，请预览后发布', tone: 'success' });
      setEditingId(null);
      await load();
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '保存失败',
        tone: 'danger',
      });
    }
  };
  const action = async (
    id: string,
    operation: 'preview' | 'publish' | 'disable' | 'enable',
  ) => {
    const response = await fetch(
      `/api/admin/activities/${id}/${operation}`,
      { method: 'POST' },
    );
    const payload = await response.json();
    if (!response.ok) {
      pushToast({ message: payload.error ?? '操作失败', tone: 'danger' });
      return;
    }
    pushToast({
      message:
        operation === 'preview'
          ? `预览完成：预计 ${payload.preview.audienceCount ?? '按玩家领取'} 人，奖励 ${(payload.preview.rewardSummary ?? []).join('、') || '无'}`
          : operation === 'publish' || operation === 'enable'
            ? '活动已发布'
            : '活动已停用',
      tone: 'success',
    });
    await load();
  };
  const edit = (activity: AdminActivityView) => {
    if (activity.status !== 'draft') return;
    setEditingId(activity.id);
    setName(activity.name);
    setCode(activity.code);
    setType(activity.activityType);
    const toLocal = (value: string) => {
      const date = new Date(value);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16);
    };
    setStartsAt(toLocal(activity.startsAt));
    setEndsAt(activity.endsAt ? toLocal(activity.endsAt) : '');
    setRealmMin(activity.audience.realmMin ?? '');
    setRealmMax(activity.audience.realmMax ?? '');
    const config = activity.config;
    setTitle(
      'title' in config ? config.title : config.mailTitle,
    );
    setContent(
      'content' in config ? config.content : config.mailContent,
    );
    setDescription(
      config.kind === 'login_reward' ? config.description : '',
    );
    setRedeemCode(config.kind === 'redeem_code' ? config.code ?? '' : '');
    setTotalLimit(
      config.kind === 'redeem_code' && config.totalLimit
        ? String(config.totalLimit)
        : '',
    );
    setRewards(
      'rewardSelections' in config
        ? config.rewardSelections.map((selection) => ({
            ...selection,
            quantity: String(selection.quantity),
          }))
        : [],
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return (
    <div className="space-y-6">
      <header className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <h2 className="font-heading text-ink text-3xl">活动配置中心</h2>
        <p className="text-ink-secondary mt-3 text-sm">
          统一配置登录奖励、玩家公告、游戏邮件和兑换码。活动先存草稿，预览确认后发布。
        </p>
      </header>
      <section className="border-ink/15 bg-bgpaper/90 grid gap-4 border border-dashed p-5 md:grid-cols-2">
        <InkInput label="活动名称" value={name} onChange={setName} />
        <InkInput label="活动编码（小写英文）" value={code} onChange={setCode} />
        <InkSelect label="活动类型" value={type} onChange={(value) => setType(value as AdminActivityType)}>
          <option value="login_reward">登录领取奖励</option>
          <option value="announcement">玩家公告</option>
          <option value="game_mail">批量游戏邮件</option>
          <option value="redeem_code">兑换码</option>
        </InkSelect>
        <div />
        <InkInput label="开始时间" type="datetime-local" value={startsAt} onChange={setStartsAt} />
        <InkInput label="结束时间（可选）" type="datetime-local" value={endsAt} onChange={setEndsAt} />
        <InkSelect label="境界下限" value={realmMin} onChange={setRealmMin}><option value="">不限</option>{REALM_VALUES.map((realm) => <option key={realm}>{realm}</option>)}</InkSelect>
        <InkSelect label="境界上限" value={realmMax} onChange={setRealmMax}><option value="">不限</option>{REALM_VALUES.map((realm) => <option key={realm}>{realm}</option>)}</InkSelect>
        <div className="md:col-span-2">
          <InkInput label={type === 'announcement' || type === 'game_mail' ? '标题' : '奖励邮件标题'} value={title} onChange={setTitle} />
        </div>
        <div className="md:col-span-2">
          <InkInput label={type === 'announcement' || type === 'game_mail' ? '正文' : '奖励邮件正文'} value={content} onChange={setContent} multiline rows={5} />
        </div>
        {type === 'login_reward' ? <div className="md:col-span-2"><InkInput label="活动说明" value={description} onChange={setDescription} multiline rows={3} /></div> : null}
        {type === 'redeem_code' ? <>
          <InkInput label="指定兑换码（留空自动生成）" value={redeemCode} onChange={setRedeemCode} />
          <InkInput label="总领取上限（可选）" type="number" value={totalLimit} onChange={setTotalLimit} />
        </> : null}
        {type !== 'announcement' ? <div className="md:col-span-2"><RewardSelectionEditor value={rewards} onChange={setRewards} allowEmpty={type === 'game_mail'} /></div> : null}
        <div className="md:col-span-2"><InkButton onClick={() => void saveDraft()}>{editingId ? '保存草稿修改' : '保存活动草稿'}</InkButton></div>
      </section>
      <section className="border-ink/15 bg-bgpaper/90 overflow-x-auto border border-dashed p-5">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead><tr><th>名称</th><th>类型</th><th>状态</th><th>时间窗</th><th>版本</th><th>操作</th></tr></thead>
          <tbody>{activities.map((activity) => <tr key={activity.id} className="border-ink/10 border-t"><td className="py-3">{activity.name}<br /><span className="text-xs">{activity.code}</span></td><td>{activity.activityType}</td><td>{activity.status}</td><td>{new Date(activity.startsAt).toLocaleString()} — {activity.endsAt ? new Date(activity.endsAt).toLocaleString() : '长期'}</td><td>v{activity.version}</td><td className="space-x-2"><button onClick={() => void action(activity.id, 'preview')}>预览</button>{activity.status === 'draft' ? <><button onClick={() => edit(activity)}>编辑</button><button onClick={() => void action(activity.id, 'publish')}>发布</button></> : null}{['scheduled', 'active'].includes(activity.status) ? <button onClick={() => void action(activity.id, 'disable')}>停用</button> : null}{activity.status === 'disabled' ? <button onClick={() => void action(activity.id, 'enable')}>重新开启</button> : null}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}
