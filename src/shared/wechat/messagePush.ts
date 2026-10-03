import { createDecipheriv, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export function verifyMessagePushSignature(
  token: string,
  input: {
    signature: string;
    timestamp: string;
    nonce: string;
    encrypt?: string;
  },
): boolean {
  if (
    !token ||
    !/^\d{1,20}$/.test(input.timestamp) ||
    !input.nonce ||
    input.nonce.length > 128 ||
    !/^[a-f\d]{40}$/i.test(input.signature)
  )
    return false;
  const parts = [token, input.timestamp, input.nonce];
  if (input.encrypt) parts.push(input.encrypt);
  const expected = createHash('sha1').update(parts.sort().join('')).digest();
  return timingSafeEqual(expected, Buffer.from(input.signature, 'hex'));
}

export function decryptMessagePush(
  encodedKey: string,
  encrypt: string,
  appId: string,
): string {
  if (
    !/^[A-Za-z0-9+/]{43}$/.test(encodedKey) ||
    !appId ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encrypt)
  )
    throw Error('Invalid encrypted message');
  const key = Buffer.from(encodedKey + '=', 'base64');
  const ciphertext = Buffer.from(encrypt, 'base64');
  if (key.length !== 32 || !ciphertext.length || ciphertext.length % 16 !== 0)
    throw Error('Invalid encrypted message');
  const decipher = createDecipheriv('aes-256-cbc', key, key.subarray(0, 16));
  decipher.setAutoPadding(false);
  const full = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const padding = full.at(-1) ?? 0;
  if (
    padding < 1 ||
    padding > 32 ||
    padding > full.length ||
    full.subarray(full.length - padding).some((value) => value !== padding)
  )
    throw Error('Invalid message padding');
  const frame = full.subarray(0, full.length - padding);
  if (frame.length < 20) throw Error('Invalid message frame');
  const end = 20 + frame.readUInt32BE(16);
  if (end > frame.length || frame.subarray(end).toString('utf8') !== appId)
    throw Error('Invalid message receiver');
  return frame.subarray(20, end).toString('utf8');
}

export function readXmlValue(xml: string, name: string): string {
  const value =
    xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? '';
  if (value.startsWith('<![CDATA[') && value.endsWith(']]>'))
    return value.slice(9, -3);
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export const WechatGameGiftPayloadSchema = z.object({
  orderId: z.string().min(1).max(128),
  giftId: z.string().max(256),
  toUserOpenid: z.string().min(1).max(128),
  isPreview: z.boolean(),
  goods: z
    .array(
      z.object({
        id: z.string().min(1).max(128),
        quantity: z.number().int().positive().max(1_000_000_000),
      }),
    )
    .min(1)
    .max(100),
});
export type WechatGameGiftPayload = z.infer<typeof WechatGameGiftPayloadSchema>;

export function parseMessagePush(raw: string): {
  type: string;
  event: string;
  gift?: WechatGameGiftPayload;
} {
  const xml = raw.trim().startsWith('<');
  const parsed = xml ? null : JSON.parse(raw);
  const type = xml
    ? readXmlValue(raw, 'MsgType')
    : String(parsed.MsgType ?? '');
  const event = xml ? readXmlValue(raw, 'Event') : String(parsed.Event ?? '');
  if (type !== 'event' || event !== 'minigame_deliver_goods')
    return { type, event };
  const mini = xml
    ? (raw.match(/<MiniGame>([\s\S]*?)<\/MiniGame>/)?.[1] ?? '')
    : parsed.MiniGame;
  const preview = xml
    ? readXmlValue(mini, 'IsPreview')
    : String(mini?.IsPreview ?? '');
  if (!['0', '1'].includes(preview)) throw Error('Invalid preview flag');
  const goods = xml
    ? [...mini.matchAll(/<GoodsList>([\s\S]*?)<\/GoodsList>/g)].map(
        (match: RegExpMatchArray) => ({
          id: readXmlValue(match[1], 'Id'),
          quantity: Number(readXmlValue(match[1], 'Num')),
        }),
      )
    : (Array.isArray(mini?.GoodsList) ? mini.GoodsList : [mini?.GoodsList]).map(
        (item: { Id?: unknown; Num?: unknown } | undefined) => ({
          id: item?.Id,
          quantity: Number(item?.Num),
        }),
      );
  const field = (name: string) =>
    xml ? readXmlValue(mini, name) : (mini?.[name] ?? '');
  return {
    type,
    event,
    gift: WechatGameGiftPayloadSchema.parse({
      orderId: field('OrderId'),
      giftId: field('GiftId'),
      toUserOpenid: field('ToUserOpenid'),
      isPreview: preview === '1',
      goods,
    }),
  };
}
