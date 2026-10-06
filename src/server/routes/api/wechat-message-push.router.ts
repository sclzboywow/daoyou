import type { AppEnv } from '@server/lib/hono/types';
import { deliverWechatGameGift } from '@server/lib/services/WechatGameGiftDeliveryService';
import {
  decryptMessagePush,
  parseMessagePush,
  readXmlValue,
  verifyMessagePushSignature,
} from '@shared/wechat/messagePush';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

const router = new Hono<AppEnv>();
function config() {
  return {
    token: process.env.WECHAT_MESSAGE_PUSH_TOKEN?.trim() ?? '',
    aesKey: process.env.WECHAT_MESSAGE_PUSH_ENCODING_AES_KEY?.trim() ?? '',
    appId: process.env.WECHAT_MINI_GAME_APP_ID?.trim() ?? '',
  };
}
router.use('/', bodyLimit({ maxSize: 128_000 }));
router.get('/', (c) => {
  const settings = config();
  const valid = verifyMessagePushSignature(settings.token, {
    signature: c.req.query('signature') ?? '',
    timestamp: c.req.query('timestamp') ?? '',
    nonce: c.req.query('nonce') ?? '',
  });
  if (!valid) return c.text('Invalid signature', 401);
  const echo = c.req.query('echostr') ?? '';
  if (!echo || echo.length > 1024) return c.text('Invalid echo', 400);
  return c.text(echo);
});
router.post('/', async (c) => {
  let stage = 'envelope';
  const contentType = c.req.header('content-type') ?? '';
  const json = contentType.includes('json');
  const result = (code: number, message: string) =>
    json
      ? c.json({ ErrCode: code, ErrMsg: message })
      : c.body(
          `<xml><ErrCode>${code}</ErrCode><ErrMsg>${message}</ErrMsg></xml>`,
          200,
          { 'Content-Type': 'application/xml; charset=utf-8' },
        );
  try {
    const raw = await c.req.text();
    const envelope = json ? JSON.parse(raw) : null;
    const encrypt = json
      ? (envelope.Encrypt ?? envelope.encrypt)
      : readXmlValue(raw, 'Encrypt');
    const settings = config();
    // A plain signature does not authenticate the POST body. Gift delivery must
    // use the encrypted message signature and validate the embedded AppID.
    if (
      typeof encrypt !== 'string' ||
      !encrypt ||
      !verifyMessagePushSignature(settings.token, {
        signature: c.req.query('msg_signature') ?? '',
        timestamp: c.req.query('timestamp') ?? '',
        nonce: c.req.query('nonce') ?? '',
        encrypt,
      })
    )
      return result(1, 'Invalid encrypted signature');
    stage = 'decrypt';
    const decrypted = decryptMessagePush(
      settings.aesKey,
      encrypt,
      settings.appId,
    );
    stage = 'parse';
    const message = parseMessagePush(decrypted);
    // This is the shared WeChat message endpoint; unrelated signed events are ACKed.
    if (!message.gift) return result(0, 'Success');
    stage = 'delivery';
    await deliverWechatGameGift(message.gift);
    return result(0, 'Success');
  } catch (error) {
    // Do not log OpenID, message bodies, tokens or ciphertext.
    const message = error instanceof Error ? error.message : '';
    const reason = message.startsWith('礼包道具未配置或已下架：')
      ? 'goods_unavailable'
      : message === '小游戏礼包未配置'
        ? 'gift_unconfigured'
        : message === '礼包接收玩家尚未登录游戏'
          ? 'account_unlinked'
          : message === '礼包接收玩家没有 active 角色'
            ? 'character_missing'
            : 'invalid_or_unavailable';
    console.warn('[wechat-message-push] delivery rejected or unavailable', {
      stage,
      reason,
    });
    return result(1, 'Gift delivery failed');
  }
});
export default router;
