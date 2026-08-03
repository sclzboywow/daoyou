import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton, InkInput } from '@app/components/ui';
import type {
  AdminPlayerDetail,
  AdminPlayerSearchRow,
} from '@shared/contracts/adminPlatform';
import { useState } from 'react';
import { RewardSelectionEditor } from '../_components/RewardSelectionEditor';
import {
  parseRewardSelectionDrafts,
  type RewardSelectionDraft,
} from '../_components/RewardSelectionEditor.helpers';

export default function AdminPlayersPage() {
  const { pushToast } = useInkUI();
  const [keyword, setKeyword] = useState('');
  const [players, setPlayers] = useState<AdminPlayerSearchRow[]>([]);
  const [detail, setDetail] = useState<AdminPlayerDetail | null>(null);
  const [title, setTitle] = useState('运营补发');
  const [content, setContent] = useState('道友您好，请查收本次补发奖励。');
  const [reason, setReason] = useState('');
  const [rewards, setRewards] = useState<RewardSelectionDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const search = async () => {
    const response = await fetch(
      `/api/admin/players?keyword=${encodeURIComponent(keyword)}`,
    );
    const payload = await response.json();
    if (response.ok) setPlayers(payload.players ?? []);
  };
  const select = async (id: string) => {
    const response = await fetch(`/api/admin/players/${id}`);
    const payload = await response.json();
    if (response.ok) setDetail(payload.detail);
  };
  const compensate = async () => {
    if (!detail || submitting) return;
    try {
      const normalizedTitle = title.trim();
      const normalizedContent = content.trim();
      const normalizedReason = reason.trim();
      if (!normalizedTitle) throw new Error('请填写邮件标题');
      if (!normalizedContent) throw new Error('请填写邮件正文');
      if (!normalizedReason) throw new Error('请填写补发原因');

      const rewardSelections = parseRewardSelectionDrafts(rewards, {
        allowEmpty: true,
      });
      setSubmitting(true);
      const response = await fetch(
        `/api/admin/players/${detail.player.cultivatorId}/compensate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: normalizedTitle,
            content: normalizedContent,
            reason: normalizedReason,
            rewardSelections,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? '补发失败');
      pushToast({ message: '补发已进入任务队列', tone: 'success' });
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '补发失败',
        tone: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="space-y-6">
      <header className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <h2 className="font-heading text-ink text-3xl">玩家检索与定向补发</h2>
        <p className="text-ink-secondary mt-3 text-sm">
          支持角色名、邮箱、角色 ID、用户 ID
          检索，查看资产与进度后通过游戏邮件补发。
        </p>
      </header>
      <section className="border-ink/15 bg-bgpaper/90 border border-dashed p-5">
        <div className="flex gap-2">
          <input
            className="border-ink/20 min-w-80 border px-3 py-2"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="角色名 / 邮箱 / ID"
          />
          <button onClick={() => void search()}>检索</button>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {players.map((player) => (
            <button
              key={player.cultivatorId}
              className="border-ink/15 border p-3 text-left"
              onClick={() => void select(player.cultivatorId)}
            >
              <strong>{player.name}</strong> · {player.realm}
              {player.stage}
              <br />
              <span className="text-xs">
                {player.email} · {player.cultivatorId}
              </span>
            </button>
          ))}
        </div>
      </section>
      {detail ? (
        <section className="border-ink/15 bg-bgpaper/90 space-y-5 border border-dashed p-5">
          <h3 className="font-heading text-2xl">
            {detail.player.name} · {detail.player.realm}
            {detail.player.stage}
          </h3>
          <div className="grid gap-3 text-sm md:grid-cols-4">
            <div>灵石 {detail.player.spiritStones}</div>
            <div>声望 {detail.player.reputation}</div>
            <div>材料 {detail.inventory.materialQuantity}</div>
            <div>未领邮件 {detail.progress.unclaimedRewardMails}</div>
            <div>
              任务 {detail.progress.activeTasks}/
              {detail.progress.completedTasks}
            </div>
            <div>副本记录 {detail.progress.dungeonRuns}</div>
            <div>宗门 {detail.sect?.sectId ?? '无'}</div>
            <div>
              最后活跃{' '}
              {detail.player.lastActiveAt
                ? new Date(detail.player.lastActiveAt).toLocaleString()
                : '暂无'}
            </div>
          </div>
          <h4 className="font-heading text-xl">定向补发</h4>
          <InkInput label="邮件标题" value={title} onChange={setTitle} />
          <InkInput
            label="邮件正文"
            value={content}
            onChange={setContent}
            multiline
            rows={4}
          />
          <RewardSelectionEditor
            value={rewards}
            onChange={setRewards}
            allowEmpty
          />
          <InkInput
            label="补发原因（必填）"
            value={reason}
            onChange={setReason}
          />
          <InkButton disabled={submitting} onClick={() => void compensate()}>
            {submitting ? '正在加入队列…' : '确认加入补发队列'}
          </InkButton>
        </section>
      ) : null}
    </div>
  );
}
