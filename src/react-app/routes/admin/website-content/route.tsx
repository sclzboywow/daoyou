import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton } from '@app/components/ui/InkButton';
import { InkInput } from '@app/components/ui/InkInput';
import {
  DEFAULT_WEBSITE_CONTENT,
  WebsiteContentSchema,
  type WebsiteContent,
  type WebsiteContentVersion,
  type WebsiteUpdate,
} from '@shared/config/websiteContent';
import { useCallback, useEffect, useState } from 'react';

type AdminState = {
  draft: WebsiteContent;
  published: WebsiteContent;
  history: WebsiteContentVersion[];
  hasPublishedContent: boolean;
  hasDraftContent: boolean;
};

function cloneContent(content: WebsiteContent): WebsiteContent {
  return JSON.parse(JSON.stringify(content)) as WebsiteContent;
}

function nextUpdateKey(updates: WebsiteUpdate[]) {
  let index = updates.length + 1;
  while (updates.some((update) => update.key === `update-${index}`)) index += 1;
  return `update-${index}`;
}

function emptyUpdate(updates: WebsiteUpdate[]): WebsiteUpdate {
  return {
    key: nextUpdateKey(updates),
    type: 'announcement',
    title: '新官网动态',
    summary: '在这里填写面向玩家的公告或更新摘要。',
    href: '/updates/',
    publishedAt: new Date().toISOString().slice(0, 10),
    tags: [],
    pinned: false,
    enabled: true,
    sortOrder: (updates.length + 1) * 10,
  };
}

function fieldClassName() {
  return 'border-ink/20 bg-paper text-ink focus:border-crimson/50 w-full border border-dashed px-3 py-2 text-sm outline-none';
}

function textAreaClassName() {
  return `${fieldClassName()} min-h-28 resize-y leading-7`;
}

export default function WebsiteContentAdminPage() {
  const { pushToast } = useInkUI();
  const [state, setState] = useState<AdminState | null>(null);
  const [draft, setDraft] = useState<WebsiteContent>(
    cloneContent(DEFAULT_WEBSITE_CONTENT),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/website-content', {
      cache: 'no-store',
    });
    const payload = (await response.json()) as AdminState & { error?: string };
    if (!response.ok) throw new Error(payload.error || '加载官网动态失败');
    const parsedDraft = WebsiteContentSchema.parse(payload.draft);
    setState({ ...payload, draft: parsedDraft });
    setDraft(cloneContent(parsedDraft));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (error) {
        if (!cancelled) {
          pushToast({
            message:
              error instanceof Error ? error.message : '加载官网动态失败',
            tone: 'danger',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, pushToast]);

  const updateEntry = (index: number, patch: Partial<WebsiteUpdate>) => {
    setDraft((current) => ({
      ...current,
      updates: current.updates.map((update, updateIndex) =>
        updateIndex === index ? { ...update, ...patch } : update,
      ),
    }));
  };

  const moveEntry = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.updates.length) return current;
      const updates = [...current.updates];
      [updates[index], updates[target]] = [updates[target], updates[index]];
      return {
        ...current,
        updates: updates.map((update, updateIndex) => ({
          ...update,
          sortOrder: (updateIndex + 1) * 10,
        })),
      };
    });
  };

  const saveDraft = async () => {
    const parsed = WebsiteContentSchema.safeParse(draft);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message || '请检查官网动态');
    }
    const response = await fetch('/api/admin/website-content', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: parsed.data }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '保存草稿失败');
  };

  const run = async (task: () => Promise<void>) => {
    setSaving(true);
    try {
      await task();
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '操作失败',
        tone: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  const publish = () =>
    run(async () => {
      await saveDraft();
      const response = await fetch('/api/admin/website-content/publish', {
        method: 'POST',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '发布失败');
      pushToast({ message: '官网版本动态已发布', tone: 'success' });
      await load();
    });

  const rollback = (version: WebsiteContentVersion) =>
    run(async () => {
      if (
        !window.confirm(
          `确定恢复 ${new Date(version.publishedAt).toLocaleString()} 的官网动态版本吗？`,
        )
      ) {
        return;
      }
      const response = await fetch('/api/admin/website-content/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: version.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '恢复历史版本失败');
      pushToast({ message: '历史动态版本已恢复并重新发布', tone: 'success' });
      await load();
    });

  if (loading) {
    return <div className="text-ink-secondary p-6">正在加载官网动态……</div>;
  }

  return (
    <div className="space-y-6">
      <header className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <p className="text-ink-secondary text-xs tracking-[0.22em]">
          OFFICIAL UPDATES
        </p>
        <h2 className="font-heading text-ink mt-2 text-3xl">官网版本动态</h2>
        <p className="text-ink-secondary mt-3 max-w-3xl text-sm leading-7">
          维护原官网“版本动态”中的公告与更新日志。编辑先进入草稿，发布后首页与版本动态页会自动更新；旧官网的设计、导航和资料入口保持不变。
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="border-ink/15 border border-dashed px-2 py-1">
            线上：{state?.hasPublishedContent ? '后台发布版本' : '代码默认版本'}
          </span>
          <span className="border-ink/15 border border-dashed px-2 py-1">
            当前展示：{draft.updates.filter((item) => item.enabled).length} 条
          </span>
          <span className="border-ink/15 border border-dashed px-2 py-1">
            历史：{state?.history.length ?? 0} 个版本
          </span>
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-ink text-xl font-semibold">动态条目</h3>
            <p className="text-ink-secondary mt-1 text-sm">
              公告进入“公告”分类，更新日志进入“更新日志”分类；置顶内容优先展示。
            </p>
          </div>
          <InkButton
            type="button"
            variant="secondary"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                updates: [...current.updates, emptyUpdate(current.updates)],
              }))
            }
          >
            新增动态
          </InkButton>
        </div>

        {draft.updates.map((update, index) => (
          <article
            key={update.key}
            className="border-ink/15 bg-bgpaper/90 space-y-4 border border-dashed p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-ink-secondary text-xs">#{index + 1}</span>
                <strong className="text-ink">{update.title}</strong>
                <label className="text-ink-secondary flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={update.enabled}
                    onChange={(event) =>
                      updateEntry(index, { enabled: event.target.checked })
                    }
                  />
                  官网展示
                </label>
                <label className="text-ink-secondary flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={update.pinned}
                    onChange={(event) =>
                      updateEntry(index, { pinned: event.target.checked })
                    }
                  />
                  置顶
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <InkButton
                  type="button"
                  variant="secondary"
                  disabled={index === 0}
                  onClick={() => moveEntry(index, -1)}
                >
                  上移
                </InkButton>
                <InkButton
                  type="button"
                  variant="secondary"
                  disabled={index === draft.updates.length - 1}
                  onClick={() => moveEntry(index, 1)}
                >
                  下移
                </InkButton>
                <InkButton
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      updates: current.updates.filter(
                        (_, updateIndex) => updateIndex !== index,
                      ),
                    }))
                  }
                >
                  删除
                </InkButton>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <InkInput
                label="动态标识"
                value={update.key}
                onChange={(value) =>
                  updateEntry(index, {
                    key: value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                  })
                }
              />
              <InkInput
                label="标题"
                value={update.title}
                onChange={(value) => updateEntry(index, { title: value })}
              />
              <label className="block text-sm">
                <span className="text-ink mb-2 block font-medium">分类</span>
                <select
                  className={fieldClassName()}
                  value={update.type}
                  onChange={(event) =>
                    updateEntry(index, {
                      type: event.target.value as WebsiteUpdate['type'],
                    })
                  }
                >
                  <option value="announcement">公告</option>
                  <option value="update">更新日志</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-ink mb-2 block font-medium">
                  发布日期
                </span>
                <input
                  type="date"
                  className={fieldClassName()}
                  value={update.publishedAt}
                  onChange={(event) =>
                    updateEntry(index, { publishedAt: event.target.value })
                  }
                />
              </label>
              <InkInput
                label="详情链接"
                value={update.href}
                onChange={(value) => updateEntry(index, { href: value })}
                placeholder="例如：/updates/xxx/ 或 /login"
              />
            </div>

            <label className="block text-sm">
              <span className="text-ink mb-2 block font-medium">摘要</span>
              <textarea
                className={textAreaClassName()}
                value={update.summary}
                onChange={(event) =>
                  updateEntry(index, { summary: event.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink mb-2 block font-medium">
                标签（每行一条，最多 8 条）
              </span>
              <textarea
                className={textAreaClassName()}
                value={update.tags.join('\n')}
                onChange={(event) =>
                  updateEntry(index, {
                    tags: event.target.value
                      .split('\n')
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .slice(0, 8),
                  })
                }
              />
            </label>
          </article>
        ))}
      </section>

      <section className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <div className="flex flex-wrap gap-3">
          <InkButton
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={() =>
              void run(async () => {
                await saveDraft();
                pushToast({ message: '官网动态草稿已保存', tone: 'success' });
                await load();
              })
            }
          >
            {saving ? '处理中…' : '保存草稿'}
          </InkButton>
          <InkButton
            type="button"
            variant="primary"
            disabled={saving}
            onClick={() => void publish()}
          >
            发布到官网
          </InkButton>
          <InkButton
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={() =>
              void run(async () => {
                const response = await fetch(
                  '/api/admin/website-content/reset-draft',
                  { method: 'POST' },
                );
                const payload = await response.json();
                if (!response.ok) {
                  throw new Error(payload.error || '恢复草稿失败');
                }
                pushToast({
                  message: '草稿已恢复为当前线上版本',
                  tone: 'success',
                });
                await load();
              })
            }
          >
            放弃草稿改动
          </InkButton>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="border-ink/20 text-ink-secondary hover:text-crimson inline-flex items-center border border-dashed px-4 py-2 text-sm no-underline"
          >
            打开官网查看
          </a>
        </div>
      </section>

      <section className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <h3 className="text-ink text-xl font-semibold">发布历史</h3>
        {(state?.history.length ?? 0) === 0 ? (
          <p className="text-ink-secondary mt-3 text-sm">
            尚无后台发布记录。首次发布后会在这里生成版本。
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {state?.history.map((version, index) => (
              <div
                key={version.id}
                className="border-ink/10 flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm"
              >
                <div>
                  <div className="text-ink">
                    {index === 0 ? '当前/最近发布 · ' : ''}
                    {new Date(version.publishedAt).toLocaleString()}
                  </div>
                  <div className="text-ink-secondary mt-1 text-xs">
                    {version.action === 'rollback' ? '回滚发布' : '正常发布'} ·{' '}
                    {
                      version.content.updates.filter((item) => item.enabled)
                        .length
                    }{' '}
                    条动态
                  </div>
                </div>
                <InkButton
                  type="button"
                  variant="secondary"
                  disabled={saving || index === 0}
                  onClick={() => void rollback(version)}
                >
                  恢复此版本
                </InkButton>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
