import { authAccounts } from '@server/lib/auth/schema';
import {
  findLocalContentViolation,
  normalizeContentForModeration,
} from '@server/lib/contentSafety/localBlocklist';
import { getExecutor } from '@server/lib/drizzle/db';
import { redis } from '@server/lib/redis';
import {
  checkWechatMiniGameTextContent,
  WechatMiniGameApiError,
  type WechatTextSecurityScene,
} from '@server/lib/wechat/miniGameApi';
import { and, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';

const BLOCKED_FINGERPRINT_TTL_SECONDS = 7 * 24 * 60 * 60;
const INCIDENT_TTL_SECONDS = 30 * 24 * 60 * 60;
const INCIDENT_INDEX_KEY = 'content-safety:incidents:v1';
const WECHAT_CONTENT_CHUNK_CHARS = 2_000;

export type ContentSafetySource =
  | 'auth_display_name'
  | 'cultivator_title'
  | 'feedback'
  | 'character_generation_input'
  | 'character_generation_output'
  | 'identity_reshape_input'
  | 'identity_reshape_output'
  | 'world_chat'
  | 'sect_chat'
  | 'player_mail'
  | 'bet_battle_taunt'
  | 'craft_prompt'
  | 'black_market_input'
  | 'black_market_output'
  | 'wechat_input_preview';

export class ContentSafetyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 503,
    readonly code: 'CONTENT_REJECTED' | 'CONTENT_CHECK_UNAVAILABLE',
  ) {
    super(message);
    this.name = 'ContentSafetyError';
  }
}

function fingerprint(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function blockedFingerprintKey(hash: string): string {
  return `content-safety:blocked-fingerprint:v1:${hash}`;
}

function compactContent(values: string | readonly string[]): string[] {
  return (typeof values === 'string' ? [values] : values)
    .map((value) => value.trim())
    .filter(Boolean);
}

function splitByCodePoints(content: string, chunkSize: number): string[] {
  const characters = Array.from(content);
  const chunks: string[] = [];
  for (let index = 0; index < characters.length; index += chunkSize) {
    chunks.push(characters.slice(index, index + chunkSize).join(''));
  }
  return chunks;
}

async function findWechatOpenId(userId: string): Promise<string | null> {
  const [account] = await getExecutor()
    .select({ accountId: authAccounts.accountId })
    .from(authAccounts)
    .where(
      and(
        eq(authAccounts.userId, userId),
        eq(authAccounts.providerId, 'wechat-mini-game'),
      ),
    )
    .limit(1);
  return account?.accountId?.trim() || null;
}

async function recordIncident(input: {
  userId: string | null;
  source: ContentSafetySource;
  content: string;
  fingerprint: string;
  verdict:
    | 'local_blocklist'
    | 'remembered_block'
    | 'wechat_review'
    | 'wechat_risky'
    | 'provider_rejected';
  matchedTerm?: string;
  traceId?: string;
  label?: number;
}): Promise<void> {
  const incidentId = randomUUID();
  const incident = {
    id: incidentId,
    createdAt: new Date().toISOString(),
    ...input,
  };
  try {
    await redis
      .multi()
      .set(
        `content-safety:incident:v1:${incidentId}`,
        JSON.stringify(incident),
        'EX',
        INCIDENT_TTL_SECONDS,
      )
      .lpush(INCIDENT_INDEX_KEY, incidentId)
      .ltrim(INCIDENT_INDEX_KEY, 0, 999)
      .exec();
  } catch (error) {
    console.error('[content-safety] failed to persist incident', {
      incidentId,
      source: input.source,
      error,
    });
  }
  console.warn('[content-safety] content rejected', {
    incidentId,
    userId: input.userId,
    source: input.source,
    verdict: input.verdict,
    fingerprint: input.fingerprint,
    traceId: input.traceId,
    label: input.label,
  });
}

async function rememberBlockedFingerprint(hash: string): Promise<void> {
  try {
    await redis.set(
      blockedFingerprintKey(hash),
      new Date().toISOString(),
      'EX',
      BLOCKED_FINGERPRINT_TTL_SECONDS,
    );
  } catch (error) {
    console.error('[content-safety] failed to remember blocked content', {
      fingerprint: hash,
      error,
    });
  }
}

async function isRememberedBlocked(hash: string): Promise<boolean> {
  try {
    return (await redis.exists(blockedFingerprintKey(hash))) > 0;
  } catch {
    return false;
  }
}

function rejectedError(): ContentSafetyError {
  return new ContentSafetyError(
    '内容不符合社区规范，请修改后重试',
    400,
    'CONTENT_REJECTED',
  );
}

export function hasLocalContentViolation(
  content: string | readonly string[],
): boolean {
  return compactContent(content).some((value) =>
    Boolean(findLocalContentViolation(value)),
  );
}

export async function assertUserGeneratedContentSafe(input: {
  userId: string;
  source: ContentSafetySource;
  scene: WechatTextSecurityScene;
  content: string | readonly string[];
}): Promise<void> {
  const values = compactContent(input.content);
  if (values.length === 0) return;
  const normalized = values
    .map(normalizeContentForModeration)
    .filter(Boolean)
    .join('\n');
  if (!normalized) return;
  const hash = fingerprint(normalized);

  for (const value of values) {
    const violation = findLocalContentViolation(value);
    if (!violation) continue;
    await rememberBlockedFingerprint(hash);
    await recordIncident({
      userId: input.userId,
      source: input.source,
      content: values.join('\n'),
      fingerprint: hash,
      verdict: 'local_blocklist',
      matchedTerm: violation.matchedTerm,
    });
    throw rejectedError();
  }

  if (await isRememberedBlocked(hash)) {
    await recordIncident({
      userId: input.userId,
      source: input.source,
      content: values.join('\n'),
      fingerprint: hash,
      verdict: 'remembered_block',
    });
    throw rejectedError();
  }

  let openId: string | null;
  try {
    openId = await findWechatOpenId(input.userId);
  } catch (error) {
    console.error('[content-safety] failed to resolve WeChat identity', {
      userId: input.userId,
      source: input.source,
      error,
    });
    throw new ContentSafetyError(
      '内容审核服务暂不可用，请稍后重试',
      503,
      'CONTENT_CHECK_UNAVAILABLE',
    );
  }
  if (!openId) return;

  const chunks = splitByCodePoints(
    values.join('\n'),
    WECHAT_CONTENT_CHUNK_CHARS,
  );
  for (const chunk of chunks) {
    let result;
    try {
      result = await checkWechatMiniGameTextContent({
        openId,
        content: chunk,
        scene: input.scene,
      });
    } catch (error) {
      console.error('[content-safety] WeChat check unavailable', {
        userId: input.userId,
        source: input.source,
        code: error instanceof WechatMiniGameApiError ? error.code : 'UNKNOWN',
      });
      throw new ContentSafetyError(
        '内容审核服务暂不可用，请稍后重试',
        503,
        'CONTENT_CHECK_UNAVAILABLE',
      );
    }
    if (result.suggest === 'pass') continue;

    await rememberBlockedFingerprint(hash);
    await recordIncident({
      userId: input.userId,
      source: input.source,
      content: values.join('\n'),
      fingerprint: hash,
      verdict: result.suggest === 'risky' ? 'wechat_risky' : 'wechat_review',
      traceId: result.traceId,
      label: result.label,
    });
    throw rejectedError();
  }
}

export function isProviderContentSafetyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /DataInspectionFailed|data_inspection_failed|inappropriate content/i.test(
    message,
  );
}

export async function rejectProviderUnsafeContent(input: {
  userId: string;
  source: ContentSafetySource;
  content: string | readonly string[];
}): Promise<never> {
  const values = compactContent(input.content);
  const normalized = values
    .map(normalizeContentForModeration)
    .filter(Boolean)
    .join('\n');
  const hash = fingerprint(normalized);
  await rememberBlockedFingerprint(hash);
  await recordIncident({
    userId: input.userId,
    source: input.source,
    content: values.join('\n'),
    fingerprint: hash,
    verdict: 'provider_rejected',
  });
  throw rejectedError();
}
