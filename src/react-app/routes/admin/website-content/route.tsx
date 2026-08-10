import { OfficialWebsiteView } from '@app/components/official/OfficialWebsiteView';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton } from '@app/components/ui/InkButton';
import { InkInput } from '@app/components/ui/InkInput';
import {
  DEFAULT_WEBSITE_CONTENT,
  WebsiteContentSchema,
  type WebsiteContent,
  type WebsiteContentVersion,
  type WebsiteFeature,
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

function nextFeatureKey(features: WebsiteFeature[]) {
  let index = features.length + 1;
  while (features.some((feature) => feature.key === `feature-${index}`)) index += 1;
  return `feature-${index}`;
}

function emptyFeature(features: WebsiteFeature[]): WebsiteFeature {
  return {
    key: nextFeatureKey(features),
    title: '新玩法',
    eyebrow: '玩法介绍',
    summary: '在这里填写面向玩家的玩法简介。',
    highlights: [],
    imageUrl: '',
    ctaLabel: '进入游戏',
    ctaHref: '/login',
    enabled: true,
    sortOrder: (features.length + 1) * 10,
  };
}

function textAreaClassName() {
  return 'border-ink/20 bg-paper text-ink focus:border-crimson/50 min-h-28 w-full resize-y border border-dashed px-3 py-2 text-sm leading-7 outline-none';
}

export default function WebsiteContentAdminPage() {
  const { pushToast } = useInkUI();
  const [state, setState] = useState<AdminState | null>(null);
  const [draft, setDraft] = useState<WebsiteContent>(
    cloneContent(DEFAULT_WEBSITE_CONTENT),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/website-content', {
      cache: 'no-store',
    });
    const payload = (await response.json()) as AdminState & { error?: string };
    if (!response.ok) throw new Error(payload.error || '加载官网内容失败');
    const parsedDraft = WebsiteContentSchema.parse(payload.draft);
    const nextState = { ...payload, draft: parsedDraft };
    setState(nextState);
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
            message: error instanceof Error ? error.message : '加载官网内容失败',
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

  const updateFeature = (index: number, patch: Partial<WebsiteFeature>) => {
    setDraft((current) => ({
      ...current,
      features: current.features.map((feature, featureIndex) =>
        featureIndex === index ? { ...feature, ...patch } : feature,
      ),
    }));
  };

  const moveFeature = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.features.length) return current;
      const features = [...current.features];
      [features[index], features[target]] = [features[target], features[index]];
      return {
        ...current,
        features: features.map((feature, featureIndex) => ({
          ...feature,
          sortOrder: (featureIndex + 1) * 10,
        })),
      };
    });
  };

  const saveDraft = async () => {
    const parsed = WebsiteContentSchema.safeParse(draft);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message || '请检查官网内容');
    }
    const response = await fetch('/api/admin/website-content', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: parsed.data }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '保存草稿失败');
    return parsed.data;
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
      pushToast({ message: '官网内容已发布', tone: 'success' });
      await load();
    });

  const rollback = (version: WebsiteContentVersion) =>
    run(async () => {
      if (!window.confirm(`确定恢复 ${new Date(version.publishedAt).toLocaleString()} 的官网版本吗？`)) return;
      const response = await fetch('/api/admin/website-content/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: version.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '恢复历史版本失败');
      pushToast({ message: '历史版本已恢复并重新发布', tone: 'success' });
      await load();
    });

  if (loading) {
    return <div className="text-ink-secondary p-6">正在加载官网内容……</div>;
  }

  return (
    <div className="space-y-6">
      <header className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <p className="text-ink-secondary text-xs tracking-[0.22em]">WEBSITE CMS</p>
        <h2 className="font-heading text-ink mt-2 text-3xl">官网内容</h2>
        <p className="text-ink-secondary mt-3 max-w-3xl text-sm leading-7">
          维护官网首页与玩法介绍。编辑只进入草稿；确认预览后再发布。发布记录最多保留最近 20 个版本，可随时回滚。
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="border-ink/15 border border-dashed px-2 py-1">
            线上：{state?.hasPublishedContent ? '后台发布版本' : '代码默认版本'}
          </span>
          <span className="border-ink/15 border border-dashed px-2 py-1">
            历史：{state?.history.length ?? 0} 个版本
          </span>
        </div>
      </header>

      <section className="border-ink/15 bg-bgpaper/90 space-y-5 border border-dashed p-6">
        <h3 className="text-ink text-xl font-semibold">首页主视觉</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <InkInput label="眉题" value={draft.hero.eyebrow} onChange={(value) => setDraft((current) => ({ ...current, hero: { ...current.hero, eyebrow: value } }))} />
          <InkInput label="主标题" value={draft.hero.title} onChange={(value) => setDraft((current) => ({ ...current, hero: { ...current.hero, title: value } }))} />
          <InkInput label="副标题" value={draft.hero.subtitle} onChange={(value) => setDraft((current) => ({ ...current, hero: { ...current.hero, subtitle: value } }))} />
          <InkInput label="主按钮文字" value={draft.hero.primaryCtaLabel} onChange={(value) => setDraft((current) => ({ ...current, hero: { ...current.hero, primaryCtaLabel: value } }))} />
          <InkInput label="主按钮链接" value={draft.hero.primaryCtaHref} onChange={(value) => setDraft((current) => ({ ...current, hero: { ...current.hero, primaryCtaHref: value } }))} />
          <InkInput label="次按钮文字" value={draft.hero.secondaryCtaLabel} onChange={(value) => setDraft((current) => ({ ...current, hero: { ...current.hero, secondaryCtaLabel: value } }))} />
          <InkInput label="次按钮链接" value={draft.hero.secondaryCtaHref} onChange={(value) => setDraft((current) => ({ ...current, hero: { ...current.hero, secondaryCtaHref: value } }))} />
        </div>
        <label className="block text-sm">
          <span className="text-ink mb-2 block font-medium">首页简介</span>
          <textarea className={textAreaClassName()} value={draft.hero.description} onChange={(event) => setDraft((current) => ({ ...current, hero: { ...current.hero, description: event.target.value } }))} />
        </label>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-ink text-xl font-semibold">核心玩法</h3>
            <p className="text-ink-secondary mt-1 text-sm">排序、开关和文案均由这里控制。暗巷黑市已按当前“查探 + 提问 + 出价谈判”玩法更新。</p>
          </div>
          <InkButton type="button" variant="secondary" onClick={() => setDraft((current) => ({ ...current, features: [...current.features, emptyFeature(current.features)] }))}>新增玩法</InkButton>
        </div>

        {draft.features.map((feature, index) => (
          <article key={feature.key} className="border-ink/15 bg-bgpaper/90 space-y-4 border border-dashed p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-ink-secondary text-xs">#{index + 1}</span>
                <strong className="text-ink">{feature.title}</strong>
                <label className="text-ink-secondary flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={feature.enabled} onChange={(event) => updateFeature(index, { enabled: event.target.checked })} />
                  官网展示
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <InkButton type="button" variant="secondary" disabled={index === 0} onClick={() => moveFeature(index, -1)}>上移</InkButton>
                <InkButton type="button" variant="secondary" disabled={index === draft.features.length - 1} onClick={() => moveFeature(index, 1)}>下移</InkButton>
                <InkButton type="button" variant="secondary" onClick={() => setDraft((current) => ({ ...current, features: current.features.filter((_, featureIndex) => featureIndex !== index).map((item, featureIndex) => ({ ...item, sortOrder: (featureIndex + 1) * 10 })) }))}>删除</InkButton>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <InkInput label="玩法标识" value={feature.key} onChange={(value) => updateFeature(index, { key: value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
              <InkInput label="玩法名称" value={feature.title} onChange={(value) => updateFeature(index, { title: value })} />
              <InkInput label="眉题" value={feature.eyebrow} onChange={(value) => updateFeature(index, { eyebrow: value })} />
              <InkInput label="宣传图 URL" value={feature.imageUrl} onChange={(value) => updateFeature(index, { imageUrl: value })} placeholder="留空使用文字占位" />
              <InkInput label="按钮文字" value={feature.ctaLabel} onChange={(value) => updateFeature(index, { ctaLabel: value })} />
              <InkInput label="按钮链接" value={feature.ctaHref} onChange={(value) => updateFeature(index, { ctaHref: value })} />
            </div>
            <label className="block text-sm">
              <span className="text-ink mb-2 block font-medium">玩法简介</span>
              <textarea className={textAreaClassName()} value={feature.summary} onChange={(event) => updateFeature(index, { summary: event.target.value })} />
            </label>
            <label className="block text-sm">
              <span className="text-ink mb-2 block font-medium">玩法亮点（每行一条，最多 8 条）</span>
              <textarea className={textAreaClassName()} value={feature.highlights.join('\n')} onChange={(event) => updateFeature(index, { highlights: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 8) })} />
            </label>
          </article>
        ))}
      </section>

      <section className="border-ink/15 bg-bgpaper/90 space-y-4 border border-dashed p-6">
        <h3 className="text-ink text-xl font-semibold">SEO</h3>
        <InkInput label="页面标题" value={draft.seo.title} onChange={(value) => setDraft((current) => ({ ...current, seo: { ...current.seo, title: value } }))} />
        <InkInput label="页面描述" value={draft.seo.description} onChange={(value) => setDraft((current) => ({ ...current, seo: { ...current.seo, description: value } }))} multiline rows={3} />
        <InkInput label="关键词" value={draft.seo.keywords} onChange={(value) => setDraft((current) => ({ ...current, seo: { ...current.seo, keywords: value } }))} />
      </section>

      <section className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <div className="flex flex-wrap gap-3">
          <InkButton type="button" variant="primary" disabled={saving} onClick={() => void run(async () => { await saveDraft(); pushToast({ message: '官网草稿已保存', tone: 'success' }); await load(); })}>{saving ? '处理中…' : '保存草稿'}</InkButton>
          <InkButton type="button" variant="secondary" disabled={saving} onClick={() => setPreview((value) => !value)}>{preview ? '关闭预览' : '预览草稿'}</InkButton>
          <InkButton type="button" variant="primary" disabled={saving} onClick={() => void publish()}>发布官网</InkButton>
          <InkButton type="button" variant="secondary" disabled={saving} onClick={() => void run(async () => { const response = await fetch('/api/admin/website-content/reset-draft', { method: 'POST' }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || '恢复草稿失败'); pushToast({ message: '草稿已恢复为当前线上版本', tone: 'success' }); await load(); })}>放弃草稿改动</InkButton>
        </div>
        <p className="text-ink-secondary mt-3 text-xs leading-6">发布前会再次保存当前编辑内容。官网接口异常或尚未发布时，前台自动使用代码内置版本，不会出现空白页。</p>
      </section>

      {preview ? (
        <section className="border-crimson/30 overflow-hidden border border-dashed">
          <OfficialWebsiteView content={draft} preview />
        </section>
      ) : null}

      <section className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <h3 className="text-ink text-xl font-semibold">发布历史</h3>
        {(state?.history.length ?? 0) === 0 ? (
          <p className="text-ink-secondary mt-3 text-sm">尚无后台发布记录。首次发布后会在这里生成版本。</p>
        ) : (
          <div className="mt-4 space-y-2">
            {state?.history.map((version, index) => (
              <div key={version.id} className="border-ink/10 flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm">
                <div>
                  <div className="text-ink">{index === 0 ? '当前/最近发布 · ' : ''}{new Date(version.publishedAt).toLocaleString()}</div>
                  <div className="text-ink-secondary mt-1 text-xs">{version.action === 'rollback' ? '回滚发布' : '正常发布'} · {version.content.features.filter((item) => item.enabled).length} 个展示玩法</div>
                </div>
                <InkButton type="button" variant="secondary" disabled={saving || index === 0} onClick={() => void rollback(version)}>恢复此版本</InkButton>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
