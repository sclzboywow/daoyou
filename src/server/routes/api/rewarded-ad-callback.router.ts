import type { AppEnv } from '@server/lib/hono/types';
import {
  receiveRewardedAdCallback,
  RewardedAdVerificationError,
  verifyRewardedAdCallbackEcho,
} from '@server/lib/services/RewardedAdVerificationService';
import { Hono, type Context } from 'hono';

const router = new Hono<AppEnv>();

function callbackParams(c: Context<AppEnv>) {
  return {
    signature: c.req.query('msg_signature') || c.req.query('signature') || '',
    timestamp: c.req.query('timestamp') || '',
    nonce: c.req.query('nonce') || '',
  };
}

function rawQueryParam(url: string, name: string) {
  const query = url.split('?', 2)[1] ?? '';
  for (const part of query.split('&')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator) !== name) continue;
    return part.slice(separator + 1);
  }
  return '';
}

function callbackError(c: Context<AppEnv>, error: unknown) {
  if (error instanceof RewardedAdVerificationError) {
    return c.json({ success: false, error: error.message, code: error.code }, error.status);
  }
  throw error;
}

async function receiveEncryptedCallback(
  c: Context<AppEnv>,
  body: Record<string, unknown> = {},
) {
  const encrypted = String(
    rawQueryParam(c.req.url, 'encrypt') || body.encrypt || '',
  ).trim();
  const params = callbackParams(c);
  const signature =
    params.signature ||
    String(body.msg_signature || body.signature || '').trim();
  const timestamp = params.timestamp || String(body.timestamp || '').trim();
  const nonce = params.nonce || String(body.nonce || '').trim();
  if (!encrypted) return c.json({ is_valid: false }, 400);
  await receiveRewardedAdCallback({
    signature,
    timestamp,
    nonce,
    encrypted,
  });
  return c.json({ is_valid: true });
}

router.get('/', async (c) => {
  try {
    if (rawQueryParam(c.req.url, 'encrypt')) {
      return await receiveEncryptedCallback(c);
    }
    const echo = c.req.query('echostr') || '';
    if (!echo) return c.json({ success: false, error: '缺少 echostr' }, 400);
    verifyRewardedAdCallbackEcho(callbackParams(c));
    return c.json({ echostr: echo });
  } catch (error) {
    return callbackError(c, error);
  }
});

router.post('/', async (c) => {
  try {
    const body: Record<string, unknown> = await c.req
      .json<Record<string, unknown>>()
      .catch(() => ({}));
    return await receiveEncryptedCallback(c, body);
  } catch (error) {
    return callbackError(c, error);
  }
});

export default router;
