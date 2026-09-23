import { createDecipheriv, createHash } from 'node:crypto';

export type MessagePushConfig = {
  token: string;
  aesKey: Buffer;
};

export class WechatMessagePushError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'WechatMessagePushError';
  }
}

export function getWechatMessagePushConfig(): MessagePushConfig {
  const token = process.env.WECHAT_MESSAGE_PUSH_TOKEN?.trim();
  const encodedKey = process.env.WECHAT_MESSAGE_PUSH_ENCODING_AES_KEY?.trim();
  if (!token || !encodedKey) {
    throw new WechatMessagePushError(
      '微信消息推送尚未配置',
      'WECHAT_MESSAGE_PUSH_NOT_CONFIGURED',
    );
  }
  const aesKey = Buffer.from(`${encodedKey}=`, 'base64');
  if (!/^[A-Za-z0-9]{43}$/.test(encodedKey) || aesKey.length !== 32) {
    throw new WechatMessagePushError(
      '微信消息推送 EncodingAESKey 无效',
      'WECHAT_MESSAGE_PUSH_AES_KEY_INVALID',
    );
  }
  return { token, aesKey };
}

function sha1(parts: string[]) {
  return createHash('sha1').update(parts.sort().join('')).digest('hex');
}

export function verifyMessagePushSignature(input: {
  signature: string;
  timestamp: string;
  nonce: string;
  encrypt?: string;
}) {
  const { token } = getWechatMessagePushConfig();
  const expected = sha1(
    input.encrypt
      ? [token, input.timestamp, input.nonce, input.encrypt]
      : [token, input.timestamp, input.nonce],
  );
  if (input.signature.toLowerCase() !== expected) {
    throw new WechatMessagePushError(
      '微信消息推送签名无效',
      'WECHAT_MESSAGE_PUSH_SIGNATURE_INVALID',
    );
  }
}

function xmlValue(xml: string, name: string) {
  const match = xml.match(
    new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`),
  );
  return match?.[1]?.trim() ?? '';
}

export function readXmlValue(xml: string, name: string) {
  return xmlValue(xml, name);
}

export function decryptMessagePush(encrypt: string): string {
  const { aesKey } = getWechatMessagePushConfig();
  try {
    const ciphertext = Buffer.from(decodeURIComponent(encrypt), 'base64');
    const decrypt = (data: Buffer, iv: Buffer) => {
      const decipher = createDecipheriv('aes-256-cbc', aesKey, iv);
      decipher.setAutoPadding(false);
      const full = Buffer.concat([decipher.update(data), decipher.final()]);
      const padding = full.at(-1) ?? 0;
      if (padding < 1 || padding > 32 || padding > full.length) {
        throw new Error('无效 PKCS#7 填充');
      }
      for (const value of full.subarray(full.length - padding)) {
        if (value !== padding) throw new Error('无效 PKCS#7 填充');
      }
      return full.subarray(0, full.length - padding);
    };
    const parsePlaintext = (full: Buffer) => {
      const text = full.toString('utf8').trim();
      if (text.startsWith('<') || text.startsWith('{')) return text;
      if (full.length < 20) throw new Error('短消息');
      const messageLength = full.readUInt32BE(16);
      const messageEnd = 20 + messageLength;
      if (messageEnd > full.length) throw new Error('消息长度越界');
      return full.subarray(20, messageEnd).toString('utf8');
    };
    try {
      return parsePlaintext(decrypt(ciphertext, aesKey.subarray(0, 16)));
    } catch {
      if (ciphertext.length <= 16) throw new Error('短密文');
      return parsePlaintext(
        decrypt(ciphertext.subarray(16), ciphertext.subarray(0, 16)),
      );
    }
  } catch {
    throw new WechatMessagePushError(
      '微信消息推送解密失败',
      'WECHAT_MESSAGE_PUSH_DECRYPT_FAILED',
    );
  }
}

export function extractEncryptedMessage(body: string, contentType: string) {
  if (contentType.includes('json')) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      return String(parsed.Encrypt ?? parsed.encrypt ?? '').trim();
    } catch {
      return '';
    }
  }
  return xmlValue(body, 'Encrypt');
}
