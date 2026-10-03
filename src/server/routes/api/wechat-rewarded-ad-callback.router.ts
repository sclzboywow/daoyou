import type { AppEnv } from '@server/lib/hono/types';
import { verifyRewardedAdTicket } from '@server/lib/services/RewardedAdApplicationService';
import {
  checkRewardSignature,
  decryptRewardEvent,
  parseRewardCallbackForm,
  rewardTimestampFresh,
  type RewardCallbackFields,
} from '@shared/rewards/wechatRewardVerification';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
const router = new Hono<AppEnv>();
router.use(
  '/rewarded-ad-callback',
  bodyLimit({
    maxSize: 20000,
    onError: (c) => c.json({ is_valid: false }, 413),
  }),
);
router.on(['GET', 'POST'], '/rewarded-ad-callback', async (c) => {
  const token =
      process.env.WECHAT_AD_REWARD_CALLBACK_TOKEN ??
      process.env.WECHAT_REWARDED_AD_TOKEN,
    key =
      process.env.WECHAT_AD_REWARD_CALLBACK_AES_KEY ??
      process.env.WECHAT_REWARDED_AD_AES_KEY;
  if (!token || !key) return c.json({ is_valid: false }, 503);
  try {
    const fields = parseRewardCallbackForm(new URL(c.req.url).search.slice(1));
    if (c.req.method === 'POST') {
      const text = await c.req.text();
      if (text.length > 20000) throw new Error('Oversized callback');
      let body: RewardCallbackFields;
      if ((c.req.header('content-type') ?? '').includes('application/json')) {
        const value: unknown = JSON.parse(text);
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new Error('Invalid callback');
        body = Object.create(null);
        for (const [name, item] of Object.entries(value)) {
          // Binary ciphertext is transported as a URL-encoded form, never a JSON string.
          if (
            name === 'encrypt' ||
            (typeof item !== 'string' && typeof item !== 'number')
          )
            throw new Error('Invalid callback field');
          body[name] = String(item);
        }
      } else body = parseRewardCallbackForm(text);
      for (const [name, value] of Object.entries(body)) {
        if (Object.hasOwn(fields, name)) throw new Error('Duplicate field');
        fields[name] = value;
      }
    }
    if (Object.values(fields).some((value) => value.length > 16384))
      return c.json({ is_valid: false }, 413);
    if (!checkRewardSignature(token, fields))
      return c.json({ is_valid: false }, 403);
    if (fields.encrypt === undefined) {
      if (
        c.req.method !== 'GET' ||
        typeof fields.echostr !== 'string' ||
        !fields.echostr ||
        fields.echostr.length > 1024
      )
        return c.json({ is_valid: false }, 400);
      return c.json({ echostr: fields.echostr });
    }
    if (!rewardTimestampFresh(fields.timestamp as string))
      return c.json({ is_valid: false }, 403);
    const event = decryptRewardEvent(key, fields.encrypt as Buffer);
    // Durable duplicate transaction receipts make provider retries harmless.
    try {
      const valid = await verifyRewardedAdTicket(
        event,
        Number(fields.timestamp),
      );
      return c.json({ is_valid: valid });
    } catch (error) {
      const cause =
        error && typeof error === 'object' && 'cause' in error
          ? error.cause
          : error;
      if (
        cause &&
        typeof cause === 'object' &&
        'code' in cause &&
        cause.code === '23505'
      )
        return c.json({ is_valid: false });
      return c.json({ is_valid: false }, 503);
    }
  } catch (error) {
    // Do not log request bodies, ciphertext or callback configuration.
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23505'
    )
      return c.json({ is_valid: false });
    return c.json({ is_valid: false }, 400);
  }
});
export default router;
