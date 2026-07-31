import { getExecutor } from '@server/lib/drizzle/db';
import { adminAuditLogs } from '@server/lib/drizzle/schema';
import { getRequestIp } from '@server/lib/http/requestIp';
import type { AppEnv } from '@server/lib/hono/types';
import type { Context, MiddlewareHandler } from 'hono';

const REDACTED_KEY_PATTERN =
  /password|passcode|secret|token|authorization|api.?key/i;
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_LENGTH = 50;
const MAX_DEPTH = 5;

function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) return '[depth-limited]';
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…`
      : value;
  }
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeAuditValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        REDACTED_KEY_PATTERN.test(key)
          ? '[redacted]'
          : sanitizeAuditValue(item, depth + 1),
      ]),
    );
  }
  return String(value);
}

async function readJson(request: {
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return null;
  }
  return request.json().catch(() => null);
}

function inferTarget(path: string): {
  targetType: string | null;
  targetId: string | null;
} {
  const parts = path
    .replace(/^\/api\/admin\/?/, '')
    .split('/')
    .filter(Boolean);
  return {
    targetType: parts[0] ?? null,
    targetId: parts[1] ?? null,
  };
}

function readReason(requestBody: unknown, context: Context): string | null {
  const headerReason = context.req.header('x-admin-reason')?.trim();
  if (headerReason) return headerReason.slice(0, 2_000);
  if (
    requestBody &&
    typeof requestBody === 'object' &&
    'reason' in requestBody &&
    typeof (requestBody as { reason?: unknown }).reason === 'string'
  ) {
    return (requestBody as { reason: string }).reason.trim().slice(0, 2_000);
  }
  return null;
}

export function adminAuditMiddleware(): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) {
      await next();
      return;
    }

    const requestClone = context.req.raw.clone();
    const requestBody = await readJson(requestClone);
    let thrown: unknown;

    try {
      await next();
    } catch (error) {
      thrown = error;
    }

    const user = context.get('user');
    if (user) {
      const responseBody = context.res
        ? await context.res
            .clone()
            .json()
            .catch(() => null)
        : null;
      const { targetType, targetId } = inferTarget(context.req.path);
      const requestId =
        context.req.header('x-request-id') ?? crypto.randomUUID();

      try {
        await getExecutor().insert(adminAuditLogs).values({
          actorUserId: user.id,
          actorEmail: user.email,
          action: `${context.req.method} ${context.req.path}`,
          targetType,
          targetId,
          reason: readReason(requestBody, context),
          requestId,
          ipAddress: getRequestIp(context) ?? null,
          status:
            thrown || !context.res || context.res.status >= 400
              ? 'failed'
              : 'succeeded',
          requestSummary: sanitizeAuditValue(requestBody),
          responseSummary: sanitizeAuditValue(
            thrown instanceof Error
              ? { error: thrown.message }
              : responseBody,
          ),
        });
      } catch (auditError) {
        console.error('[admin-audit] failed to persist audit log', auditError);
      }
    }

    if (thrown) throw thrown;
  };
}
