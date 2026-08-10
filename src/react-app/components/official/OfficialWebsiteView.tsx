import Link from '@app/components/router/AppLink';
import type { WebsiteContent } from '@shared/config/websiteContent';

function FeatureCard({
  feature,
  index,
}: {
  feature: WebsiteContent['features'][number];
  index: number;
}) {
  return (
    <article className="border-ink/15 bg-bgpaper/90 grid overflow-hidden border border-dashed lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
      <div className="p-6 md:p-8">
        <div className="text-ink-secondary flex items-center gap-3 text-xs tracking-[0.2em]">
          <span>{String(index + 1).padStart(2, '0')}</span>
          <span className="h-px w-8 bg-current opacity-30" />
          <span>{feature.eyebrow || '玩法志'}</span>
        </div>
        <h2 className="font-heading text-ink mt-3 text-3xl md:text-4xl">
          {feature.title}
        </h2>
        <p className="text-ink-secondary mt-4 max-w-3xl text-sm leading-8 md:text-base">
          {feature.summary}
        </p>
        {feature.highlights.length > 0 ? (
          <ul className="text-ink mt-5 grid gap-2 text-sm md:grid-cols-2">
            {feature.highlights.map((item) => (
              <li key={item} className="border-ink/10 border-l-2 py-1 pl-3">
                {item}
              </li>
            ))}
          </ul>
        ) : null}
        {feature.ctaLabel && feature.ctaHref ? (
          <Link
            href={feature.ctaHref}
            className="border-crimson/40 text-crimson hover:bg-crimson/5 mt-6 inline-flex border px-4 py-2 text-sm no-underline transition"
          >
            {feature.ctaLabel}
          </Link>
        ) : null}
      </div>

      <div className="bg-paper-dark/60 border-ink/10 flex min-h-52 items-center justify-center border-t lg:border-t-0 lg:border-l">
        {feature.imageUrl ? (
          <img
            src={feature.imageUrl}
            alt={`${feature.title}玩法截图`}
            className="h-full max-h-96 w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="text-center">
            <div className="font-heading text-ink/20 text-7xl">
              {feature.title.slice(0, 1)}
            </div>
            <div className="text-ink-secondary mt-3 text-xs tracking-[0.2em]">
              GAMEPLAY
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

export function OfficialWebsiteView({
  content,
  preview = false,
}: {
  content: WebsiteContent;
  preview?: boolean;
}) {
  const features = [...content.features]
    .filter((feature) => preview || feature.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="bg-paper text-ink min-h-[100svh]">
      {preview ? (
        <div className="bg-ink text-paper sticky top-0 z-20 px-4 py-2 text-center text-xs tracking-[0.18em]">
          官网草稿预览 · 尚未发布
        </div>
      ) : null}

      <header className="border-ink/10 border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 md:px-8">
          <Link href="/" className="font-heading text-ink text-xl no-underline">
            万界道友
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/login"
              className="text-ink-secondary hover:text-crimson px-2 py-1 no-underline"
            >
              登录
            </Link>
            <Link
              href="/signup"
              className="border-crimson/40 text-crimson border px-3 py-1.5 no-underline"
            >
              注册
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_15%_20%,rgba(133,51,44,.13),transparent_35%),radial-gradient(circle_at_85%_40%,rgba(88,79,55,.1),transparent_30%)]" />
          <div className="relative mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-28">
            <p className="text-crimson text-xs tracking-[0.28em]">
              {content.hero.eyebrow}
            </p>
            <h1 className="font-heading text-ink mt-5 max-w-4xl text-5xl leading-tight md:text-7xl">
              {content.hero.title}
            </h1>
            <p className="text-ink mt-5 max-w-3xl text-xl leading-9 md:text-2xl">
              {content.hero.subtitle}
            </p>
            <p className="text-ink-secondary mt-5 max-w-3xl text-sm leading-8 md:text-base">
              {content.hero.description}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {content.hero.primaryCtaLabel && content.hero.primaryCtaHref ? (
                <Link
                  href={content.hero.primaryCtaHref}
                  className="bg-crimson text-paper border-crimson border px-5 py-2.5 text-sm no-underline"
                >
                  {content.hero.primaryCtaLabel}
                </Link>
              ) : null}
              {content.hero.secondaryCtaLabel && content.hero.secondaryCtaHref ? (
                <Link
                  href={content.hero.secondaryCtaHref}
                  className="border-ink/20 text-ink hover:border-crimson/40 hover:text-crimson border border-dashed px-5 py-2.5 text-sm no-underline"
                >
                  {content.hero.secondaryCtaLabel}
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <section className="border-ink/10 border-t">
          <div className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-20">
            <div className="mb-8 md:mb-10">
              <p className="text-ink-secondary text-xs tracking-[0.22em]">
                CORE GAMEPLAY
              </p>
              <h2 className="font-heading text-ink mt-2 text-3xl md:text-4xl">
                不是一条固定的修仙流水线
              </h2>
              <p className="text-ink-secondary mt-3 max-w-2xl text-sm leading-7">
                玩法之间共享角色资源与成长结果。你在一处做出的选择，会成为下一处的条件与代价。
              </p>
            </div>
            <div className="space-y-5">
              {features.map((feature, index) => (
                <FeatureCard key={feature.key} feature={feature} index={index} />
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-ink/10 border-t">
        <div className="text-ink-secondary mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-xs md:px-8">
          <span>万界道友 · 官方玩法介绍</span>
          <span>内容以游戏内实际规则为准</span>
        </div>
      </footer>
    </div>
  );
}
