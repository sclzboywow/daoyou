import { createCipheriv } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  checkRewardSignature,
  decryptRewardEvent,
  parseRewardCallbackForm,
  rewardSignature,
  rewardTimestampFresh,
} from './wechatRewardVerification';
const key = Buffer.alloc(32, 7).toString('base64').slice(0, -1);
const event = {
  transaction_id: 'test-tx',
  user_id: '10000000-0000-4000-8000-000000000001',
  reward_item: 'adunit-test',
  reward_amount: 1,
  custom_data: '10000000-0000-4000-8000-000000000002',
};
function encrypted(value: unknown) {
  const iv = Buffer.alloc(16, 9),
    cipher = createCipheriv(
      'aes-256-cbc',
      Buffer.from(key + '=', 'base64'),
      iv,
    );
  return Buffer.concat([
    iv,
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
}
describe('WeChat rewarded ad official protocol', () => {
  it('matches the documented SHA256 handshake example', () => {
    expect(rewardSignature('AAAAA', '1714036504', '1514711492')).toBe(
      'fc2099429a41d55634cd6e24e8a610b44c404bc189921f8368343381b0b612c3',
    );
  });
  it('signs ciphertext and rejects mutated fields and malformed signatures', () => {
    const fields = {
      timestamp: '1800000000000',
      nonce: '42',
      encrypt: encrypted(event),
      signature: '',
    };
    fields.signature = rewardSignature(
      'test-token',
      fields.timestamp,
      fields.nonce,
      fields.encrypt,
    );
    expect(checkRewardSignature('test-token', fields)).toBe(true);
    expect(
      checkRewardSignature('test-token', {
        ...fields,
        encrypt: Buffer.concat([fields.encrypt, Buffer.from('x')]),
      }),
    ).toBe(false);
    expect(checkRewardSignature('other', fields)).toBe(false);
    expect(
      checkRewardSignature('test-token', { ...fields, signature: 'bad' }),
    ).toBe(false);
  });
  it('decrypts native binary IV-prefixed CBC JSON with PKCS7', () => {
    expect(decryptRewardEvent(key, encrypted(event))).toEqual(event);
  });
  it('rejects corrupted padding, incorrect keys, missing binding and forged quantities', () => {
    for (const value of [
      { ...event, custom_data: undefined },
      { ...event, user_id: 'invalid' },
      { ...event, reward_amount: 2 },
      { ...event, transaction_id: '' },
    ])
      expect(() => decryptRewardEvent(key, encrypted(value))).toThrow();
    expect(() => decryptRewardEvent('invalid', encrypted(event))).toThrow();
    const bytes = encrypted(event);
    bytes[bytes.length - 17] ^= 1;
    expect(() => decryptRewardEvent(key, bytes)).toThrow();
    expect(() => decryptRewardEvent(key, Buffer.from('garbage'))).toThrow();
  });
  it('preserves percent-escaped binary, literal plus, form space, NUL and invalid UTF-8', () => {
    const bytes = Buffer.from([0, 32, 43, 37, 38, 61, 128, 255, 192, 175]);
    const raw = '%00+%2B%25%26%3D%80%FF%C0%AF';
    const signature = rewardSignature('token', '1800000000000', '42', bytes);
    const fields = parseRewardCallbackForm(
      `timestamp=1800000000000&nonce=42&encrypt=${raw}&signature=${signature}`,
    );
    expect(fields.encrypt).toEqual(bytes);
    expect(checkRewardSignature('token', fields)).toBe(true);
    expect(
      checkRewardSignature('token', {
        ...fields,
        encrypt: Buffer.from(bytes.toString('utf8')),
      }),
    ).toBe(false);
  });
  it('round-trips a complete native callback through URL form transport', () => {
    const bytes = encrypted(event);
    const raw = [...bytes]
      .map((b) => (b === 32 ? '+' : `%${b.toString(16).padStart(2, '0')}`))
      .join('');
    const fields = parseRewardCallbackForm(
      `timestamp=1800000000000&nonce=42&encrypt=${raw}&signature=${rewardSignature('token', '1800000000000', '42', bytes)}`,
    );
    expect(checkRewardSignature('token', fields)).toBe(true);
    expect(decryptRewardEvent(key, fields.encrypt as Buffer)).toEqual(event);
  });
  it('rejects duplicate fields, malformed byte escapes and oversized input', () => {
    for (const raw of [
      'encrypt=%GG',
      'encrypt=%1',
      'nonce=1&nonce=2',
      'encrypt=%00&encrypt=%00',
      'encrypt=é',
      'x'.repeat(20001),
    ])
      expect(() => parseRewardCallbackForm(raw)).toThrow();
  });
  it('accepts delayed callbacks within ticket lifetime and rejects stale or future events', () => {
    const now = 1800000000000;
    expect(rewardTimestampFresh(String(now - 72000), now)).toBe(true);
    expect(rewardTimestampFresh(String(now - 900001), now)).toBe(false);
    expect(rewardTimestampFresh(String(now + 60001), now)).toBe(false);
    expect(rewardTimestampFresh('NaN', now)).toBe(false);
  });
});
