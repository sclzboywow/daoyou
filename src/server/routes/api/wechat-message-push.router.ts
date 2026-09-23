import type { AppEnv } from '@server/lib/hono/types';
import {
  decryptMessagePush,
  extractEncryptedMessage,
  readXmlValue,
  verifyMessagePushSignature,
  WechatMessagePushError,
} from '@server/lib/wechat/messagePush';
import { deliverWechatGameGift } from '@server/lib/services/WechatGameGiftDeliveryService';
import { Hono } from 'hono';

const router = new Hono<AppEnv>();

function xmlResponse(code: number, message: string) {
  return `<xml><ErrCode>${code}</ErrCode><ErrMsg>${message}</ErrMsg></xml>`;
}

function responseForFormat(contentType: string, code: number, message: string) {
  if (contentType.includes('json')) {
    return new Response(JSON.stringify({ ErrCode: code, ErrMsg: message }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
  return new Response(xmlResponse(code, message), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}

function parseGiftXml(xml: string) {
  const miniGame = xml.match(/<MiniGame>([\s\S]*?)<\/MiniGame>/)?.[1] ?? '';
  const goods = [...miniGame.matchAll(/<GoodsList>([\s\S]*?)<\/GoodsList>/g)].map(
    ([, item]) => ({
      id: readXmlValue(item ?? '', 'Id'),
      quantity: Number(readXmlValue(item ?? '', 'Num')),
    }),
  );
  return {
    orderId: readXmlValue(miniGame, 'OrderId'),
    toUserOpenid: readXmlValue(miniGame, 'ToUserOpenid'),
    isPreview: readXmlValue(miniGame, 'IsPreview') === '1',
    goods,
  };
}

function parseGiftJson(raw: string) {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const miniGame = (parsed.MiniGame ?? parsed.minigame ?? {}) as Record<
    string,
    unknown
  >;
  const rawGoods = miniGame.GoodsList ?? miniGame.goods_list;
  const goodsList = Array.isArray(rawGoods)
    ? rawGoods
    : rawGoods && typeof rawGoods === 'object'
      ? [rawGoods]
      : [];
  return {
    orderId: String(miniGame.OrderId ?? miniGame.order_id ?? ''),
    toUserOpenid: String(miniGame.ToUserOpenid ?? miniGame.to_user_openid ?? ''),
    isPreview: String(miniGame.IsPreview ?? miniGame.is_preview ?? '') === '1',
    goods: goodsList.map((item) => {
      const record = item as Record<string, unknown>;
      return {
        id: String(record.Id ?? record.id ?? ''),
        quantity: Number(record.Num ?? record.num ?? 0),
      };
    }),
  };
}

function errorResponse(error: unknown) {
  if (error instanceof WechatMessagePushError) {
    console.error('[wechat-message-push] request rejected', {
      code: error.code,
      message: error.message,
    });
    return new Response(xmlResponse(1, error.message), {
      status: error.code.includes('SIGNATURE') ? 401 : 400,
      headers: { 'content-type': 'application/xml; charset=utf-8' },
    });
  }
  console.error('[wechat-message-push] gift delivery failed', error);
  return new Response(xmlResponse(1, 'Gift delivery failed'), {
    status: 500,
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}

router.get('/', (c) => {
  try {
    const signature = c.req.query('signature') ?? '';
    const timestamp = c.req.query('timestamp') ?? '';
    const nonce = c.req.query('nonce') ?? '';
    const echostr = c.req.query('echostr') ?? '';
    verifyMessagePushSignature({ signature, timestamp, nonce });
    return c.text(echostr);
  } catch (error) {
    return errorResponse(error);
  }
});

router.post('/', async (c) => {
  const contentType = c.req.header('content-type') ?? '';
  try {
    const body = await c.req.text();
    const encrypt = extractEncryptedMessage(body, contentType);
    let message = body;
    if (encrypt) {
      verifyMessagePushSignature({
        signature: c.req.query('msg_signature') || c.req.query('signature') || '',
        timestamp: c.req.query('timestamp') ?? '',
        nonce: c.req.query('nonce') ?? '',
        encrypt,
      });
      message = decryptMessagePush(encrypt);
    }
    const gift = message.trim().startsWith('<')
      ? parseGiftXml(message)
      : parseGiftJson(message);
    if (
      !gift.orderId ||
      !gift.toUserOpenid ||
      gift.goods.some((item) => !item.id || !Number.isSafeInteger(item.quantity) || item.quantity < 1)
    ) {
      return errorResponse(new Error('礼包消息字段无效'));
    }
    await deliverWechatGameGift(gift);
    return responseForFormat(contentType, 0, 'Success');
  } catch (error) {
    return errorResponse(error);
  }
});

export default router;
