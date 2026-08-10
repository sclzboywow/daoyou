import { getAppSetting, upsertAppSetting } from '@server/lib/repositories/appSettingsRepository';
import {
  APP_SETTING_KEYS,
} from '@shared/lib/constants/appSettings';
import {
  DEFAULT_WEBSITE_CONTENT,
  WebsiteContentHistorySchema,
  WebsiteContentSchema,
  normalizeWebsiteContent,
  type WebsiteContent,
  type WebsiteContentVersion,
} from '@shared/config/websiteContent';
import { randomUUID } from 'crypto';

const HISTORY_LIMIT = 20;

function parseContent(raw: string | null): WebsiteContent | null {
  if (!raw) return null;
  try {
    const parsed = WebsiteContentSchema.safeParse(JSON.parse(raw));
    return parsed.success ? normalizeWebsiteContent(parsed.data) : null;
  } catch {
    return null;
  }
}

function parseHistory(raw: string | null): WebsiteContentVersion[] {
  if (!raw) return [];
  try {
    const parsed = WebsiteContentHistorySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

async function persistContent(params: {
  key: string;
  content: WebsiteContent;
  updatedBy: string;
}) {
  await upsertAppSetting({
    key: params.key,
    value: JSON.stringify(normalizeWebsiteContent(params.content)),
    updatedBy: params.updatedBy,
  });
}

async function persistHistory(params: {
  history: WebsiteContentVersion[];
  updatedBy: string;
}) {
  await upsertAppSetting({
    key: APP_SETTING_KEYS.websiteContentHistory,
    value: JSON.stringify(params.history.slice(0, HISTORY_LIMIT)),
    updatedBy: params.updatedBy,
  });
}

export async function getPublishedWebsiteContent(): Promise<WebsiteContent> {
  const raw = await getAppSetting(APP_SETTING_KEYS.websiteContentPublished);
  return parseContent(raw) ?? DEFAULT_WEBSITE_CONTENT;
}

export async function getWebsiteContentAdminState() {
  const [draftRaw, publishedRaw, historyRaw] = await Promise.all([
    getAppSetting(APP_SETTING_KEYS.websiteContentDraft),
    getAppSetting(APP_SETTING_KEYS.websiteContentPublished),
    getAppSetting(APP_SETTING_KEYS.websiteContentHistory),
  ]);

  const published = parseContent(publishedRaw) ?? DEFAULT_WEBSITE_CONTENT;
  const draft = parseContent(draftRaw) ?? published;

  return {
    draft,
    published,
    history: parseHistory(historyRaw),
    hasPublishedContent: Boolean(parseContent(publishedRaw)),
    hasDraftContent: Boolean(parseContent(draftRaw)),
  };
}

export async function saveWebsiteContentDraft(params: {
  content: WebsiteContent;
  updatedBy: string;
}) {
  const content = normalizeWebsiteContent(
    WebsiteContentSchema.parse(params.content),
  );
  await persistContent({
    key: APP_SETTING_KEYS.websiteContentDraft,
    content,
    updatedBy: params.updatedBy,
  });
  return content;
}

export async function publishWebsiteContent(params: { updatedBy: string }) {
  const state = await getWebsiteContentAdminState();
  const content = normalizeWebsiteContent(state.draft);
  const version: WebsiteContentVersion = {
    id: randomUUID(),
    publishedAt: new Date().toISOString(),
    publishedBy: params.updatedBy,
    action: 'publish',
    content,
  };
  const history = [version, ...state.history].slice(0, HISTORY_LIMIT);

  await Promise.all([
    persistContent({
      key: APP_SETTING_KEYS.websiteContentPublished,
      content,
      updatedBy: params.updatedBy,
    }),
    persistContent({
      key: APP_SETTING_KEYS.websiteContentDraft,
      content,
      updatedBy: params.updatedBy,
    }),
    persistHistory({ history, updatedBy: params.updatedBy }),
  ]);

  return { content, version, history };
}

export async function rollbackWebsiteContent(params: {
  versionId: string;
  updatedBy: string;
}) {
  const state = await getWebsiteContentAdminState();
  const source = state.history.find((version) => version.id === params.versionId);
  if (!source) return null;

  const content = normalizeWebsiteContent(source.content);
  const version: WebsiteContentVersion = {
    id: randomUUID(),
    publishedAt: new Date().toISOString(),
    publishedBy: params.updatedBy,
    action: 'rollback',
    sourceVersionId: source.id,
    content,
  };
  const history = [version, ...state.history].slice(0, HISTORY_LIMIT);

  await Promise.all([
    persistContent({
      key: APP_SETTING_KEYS.websiteContentPublished,
      content,
      updatedBy: params.updatedBy,
    }),
    persistContent({
      key: APP_SETTING_KEYS.websiteContentDraft,
      content,
      updatedBy: params.updatedBy,
    }),
    persistHistory({ history, updatedBy: params.updatedBy }),
  ]);

  return { content, version, history };
}

export async function resetWebsiteContentDraft(params: { updatedBy: string }) {
  const content = await getPublishedWebsiteContent();
  await persistContent({
    key: APP_SETTING_KEYS.websiteContentDraft,
    content,
    updatedBy: params.updatedBy,
  });
  return content;
}
