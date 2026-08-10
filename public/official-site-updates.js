(() => {
  const homeList = document.querySelector('[data-home-update-list]');
  const updatesRoot = document.querySelector('[data-updates-tabs]');

  if (!homeList && !updatesRoot) return;

  const element = (tagName, className, text) => {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (typeof text === 'string') node.textContent = text;
    return node;
  };

  const safeHref = (value) => {
    try {
      const url = new URL(value || '/updates/', window.location.origin);
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? url.href
        : '/updates/';
    } catch {
      return '/updates/';
    }
  };

  const badgeLabel = (update) =>
    update.type === 'announcement' ? '公告' : '更新日志';

  const appendTag = (container, label) => {
    container.append(element('span', 'post-tag', label));
  };

  const createHomeEntry = (update) => {
    const article = element('article', 'timeline-item group');
    article.dataset.homeUpdateItem = update.type;
    article.dataset.managedUpdateKey = update.key;
    article.append(
      element(
        'div',
        'timeline-dot group-hover:bg-crimson group-hover:scale-125',
      ),
    );

    const time = element('time', 'timeline-date', update.publishedAt);
    time.dateTime = `${update.publishedAt}T00:00:00.000Z`;
    article.append(time);

    const content = element('div', 'timeline-content');
    const tags = element('div', 'timeline-tags');
    tags.append(
      element(
        'span',
        `post-badge post-badge-${update.type}`,
        badgeLabel(update),
      ),
    );
    if (update.pinned) appendTag(tags, '置顶');
    update.tags.slice(0, 3).forEach((tag) => appendTag(tags, tag));

    const title = element(
      'a',
      'text-ink group-hover:text-crimson block text-xl font-bold transition-colors md:text-2xl',
      update.title,
    );
    title.href = safeHref(update.href);
    const summary = element(
      'p',
      'text-ink-secondary text-sm leading-7 md:text-base',
      update.summary,
    );
    content.append(tags, title, summary);
    article.append(content);
    return article;
  };

  const createUpdatesEntry = (update) => {
    const article = element('article', 'content-card post-card');
    article.dataset.managedUpdateKey = update.key;

    const meta = element('div', 'flex flex-wrap items-center gap-3');
    meta.append(
      element(
        'span',
        `post-badge post-badge-${update.type}`,
        badgeLabel(update),
      ),
    );
    if (update.pinned) appendTag(meta, '置顶');
    meta.append(element('span', 'post-date', update.publishedAt));

    const heading = element('h2', 'mt-4 text-2xl font-semibold text-ink');
    const title = element(
      'a',
      'transition-colors hover:text-crimson',
      update.title,
    );
    title.href = safeHref(update.href);
    heading.append(title);

    const summary = element(
      'p',
      'mt-3 text-sm leading-7 text-ink-secondary md:text-base',
      update.summary,
    );
    const tags = element('div', 'mt-5 flex flex-wrap gap-2');
    update.tags.forEach((tag) => appendTag(tags, tag));
    article.append(meta, heading, summary, tags);
    return article;
  };

  const wireHomeFilters = () => {
    const homeUpdates = document.querySelector('[data-home-updates]');
    homeUpdates
      ?.querySelectorAll('[data-home-update-filter]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          const filter = button.getAttribute('data-home-update-filter');
          homeUpdates
            .querySelectorAll('[data-managed-update-key]')
            .forEach((item) => {
              const matches =
                filter === 'all' ||
                item.getAttribute('data-home-update-item') === filter;
              item.classList.toggle('hidden', !matches);
            });
        });
      });
  };

  fetch('/api/website-content', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((payload) => {
      const updates = Array.isArray(payload?.content?.updates)
        ? payload.content.updates.filter((update) => update?.enabled)
        : [];

      [...updates].reverse().forEach((update) => {
        if (
          homeList &&
          !homeList.querySelector(
            `[data-managed-update-key="${CSS.escape(update.key)}"]`,
          )
        ) {
          homeList.prepend(createHomeEntry(update));
        }

        const panelList = updatesRoot?.querySelector(
          `[data-updates-panel="${update.type}"] .post-list`,
        );
        if (
          panelList &&
          !panelList.querySelector(
            `[data-managed-update-key="${CSS.escape(update.key)}"]`,
          )
        ) {
          panelList.prepend(createUpdatesEntry(update));
        }
      });

      wireHomeFilters();
    })
    .catch(() => {
      // The checked-in static updates remain available when the API is offline.
    });
})();
