import { createDecipheriv, createHash, timingSafeEqual } from 'node:crypto';
/** The provider URL-encodes binary IV+ciphertext; UTF-8 decoding destroys it. */
export type RewardCallbackFields = Record<string, string | Buffer>;
export function parseRewardCallbackForm(raw: string): RewardCallbackFields {
  if (raw.length > 20000) throw new Error('Oversized callback');
  const fields: RewardCallbackFields = Object.create(null);
  for (const part of raw.split('&')) {
    if (!part) continue;
    const split = part.indexOf('=');
    if (split < 1) throw new Error('Invalid callback field');
    const name = decodeURIComponent(part.slice(0, split).replace(/\+/g, ' '));
    if (Object.hasOwn(fields, name)) throw new Error('Duplicate field');
    const encoded = part.slice(split + 1);
    if (name === 'encrypt') {
      const bytes: number[] = [];
      for (let i = 0; i < encoded.length; i++) {
        const char = encoded[i];
        if (char === '%') {
          const hex = encoded.slice(i + 1, i + 3);
          if (!/^[a-f0-9]{2}$/i.test(hex)) throw new Error('Invalid escape');
          bytes.push(parseInt(hex, 16));
          i += 2;
        } else {
          const code = char === '+' ? 32 : char.charCodeAt(0);
          if (code > 127) throw new Error('Unescaped binary');
          bytes.push(code);
        }
      }
      fields[name] = Buffer.from(bytes);
    } else fields[name] = decodeURIComponent(encoded.replace(/\+/g, ' '));
  }
  return fields;
}
export function rewardSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt?: Buffer,
) {
  const parts = [
    Buffer.from(token),
    Buffer.from(timestamp),
    Buffer.from(nonce),
    ...(encrypt === undefined ? [] : [encrypt]),
  ];
  return createHash('sha256')
    .update(Buffer.concat(parts.sort(Buffer.compare)))
    .digest('hex');
}
export function checkRewardSignature(
  token: string,
  fields: RewardCallbackFields,
) {
  if (
    !token ||
    typeof fields.timestamp !== 'string' ||
    !/^\d{1,20}$/.test(fields.timestamp) ||
    typeof fields.nonce !== 'string' ||
    !/^\d{1,20}$/.test(fields.nonce) ||
    typeof fields.signature !== 'string' ||
    !/^[a-f0-9]{64}$/.test(fields.signature) ||
    (fields.encrypt !== undefined && !Buffer.isBuffer(fields.encrypt))
  )
    return false;
  return timingSafeEqual(
    Buffer.from(fields.signature, 'hex'),
    Buffer.from(
      rewardSignature(
        token,
        fields.timestamp,
        fields.nonce,
        fields.encrypt as Buffer | undefined,
      ),
      'hex',
    ),
  );
}
export function decryptRewardEvent(key: string, data: Buffer) {
  if (!/^[A-Za-z0-9+/]{43}$/.test(key))
    throw new Error('Invalid verification key');
  if (
    !Buffer.isBuffer(data) ||
    data.length > 16384 ||
    data.length < 32 ||
    (data.length - 16) % 16 !== 0
  )
    throw new Error('Invalid encrypted reward');
  const decipher = createDecipheriv(
    'aes-256-cbc',
    Buffer.from(key + '=', 'base64'),
    data.subarray(0, 16),
  );
  const plain = Buffer.concat([
    decipher.update(data.subarray(16)),
    decipher.final(),
  ]);
  const event: unknown = JSON.parse(plain.toString('utf8'));
  if (!event || typeof event !== 'object')
    throw new Error('Invalid reward event');
  const e = event as Record<string, unknown>;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    typeof e.transaction_id !== 'string' ||
    !e.transaction_id ||
    e.transaction_id.length > 256 ||
    typeof e.user_id !== 'string' ||
    !uuid.test(e.user_id) ||
    typeof e.custom_data !== 'string' ||
    !uuid.test(e.custom_data) ||
    typeof e.reward_item !== 'string' ||
    e.reward_item.length > 100 ||
    !Number.isSafeInteger(e.reward_amount) ||
    e.reward_amount !== 1
  )
    throw new Error('Invalid reward event');
  return e as {
    transaction_id: string;
    user_id: string;
    reward_item: string;
    reward_amount: number;
    custom_data: string;
  };
}
export function rewardTimestampFresh(timestamp: string, now = Date.now()) {
  const time = Number(timestamp);
  return (
    Number.isSafeInteger(time) &&
    time >= now - 15 * 60000 &&
    time <= now + 60000
  );
}
