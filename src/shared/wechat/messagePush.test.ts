import { createCipheriv, createHash } from 'node:crypto';
import {
  decryptMessagePush,
  parseMessagePush,
  verifyMessagePushSignature,
} from './messagePush';

const key = Buffer.alloc(32, 3);
const encodedKey = key.toString('base64').slice(0, -1);
const appId = 'wx-test-gift';
const token = 'test-only-token';
const gift = {
  MsgType: 'event',
  Event: 'minigame_deliver_goods',
  MiniGame: {
    OrderId: 'fixture-order',
    GiftId: 'fixture-gift',
    ToUserOpenid: 'fixture-openid',
    IsPreview: 1,
    GoodsList: [{ Id: 'spirit_stones', Num: 10 }],
  },
};
function encrypt(message: string, receiver = appId) {
  const content = Buffer.from(message);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(content.length);
  const raw = Buffer.concat([
    Buffer.alloc(16, 7),
    length,
    content,
    Buffer.from(receiver),
  ]);
  const padding = 32 - (raw.length % 32);
  const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([
    cipher.update(Buffer.concat([raw, Buffer.alloc(padding, padding)])),
    cipher.final(),
  ]).toString('base64');
}
function signature(ciphertext?: string) {
  return createHash('sha1')
    .update(
      [token, '1760000000', '42', ...(ciphertext ? [ciphertext] : [])]
        .sort()
        .join(''),
    )
    .digest('hex');
}
describe('WeChat message push protocol', () => {
  it('authenticates the ciphertext, not just the URL parameters', () => {
    const ciphertext = encrypt(JSON.stringify(gift));
    expect(
      verifyMessagePushSignature(token, {
        signature: signature(ciphertext),
        timestamp: '1760000000',
        nonce: '42',
        encrypt: ciphertext,
      }),
    ).toBe(true);
    expect(
      verifyMessagePushSignature(token, {
        signature: signature(),
        timestamp: '1760000000',
        nonce: '42',
        encrypt: ciphertext,
      }),
    ).toBe(false);
  });
  it('rejects a changed ciphertext or malformed signature', () => {
    const ciphertext = encrypt(JSON.stringify(gift));
    expect(
      verifyMessagePushSignature(token, {
        signature: signature(ciphertext),
        timestamp: '1760000000',
        nonce: '42',
        encrypt: ciphertext.slice(1),
      }),
    ).toBe(false);
    expect(
      verifyMessagePushSignature(token, {
        signature: 'f',
        timestamp: '1760000000',
        nonce: '42',
      }),
    ).toBe(false);
  });
  it('accepts the GET handshake signature', () => {
    expect(
      verifyMessagePushSignature(token, {
        signature: signature(),
        timestamp: '1760000000',
        nonce: '42',
      }),
    ).toBe(true);
  });
  it('decrypts a framed JSON gift and validates preview semantics', () => {
    const result = parseMessagePush(
      decryptMessagePush(encodedKey, encrypt(JSON.stringify(gift)), appId),
    );
    expect(result.gift).toEqual({
      orderId: 'fixture-order',
      giftId: 'fixture-gift',
      toUserOpenid: 'fixture-openid',
      isPreview: true,
      goods: [{ id: 'spirit_stones', quantity: 10 }],
    });
  });
  it('rejects a frame addressed to another app', () => {
    expect(() =>
      decryptMessagePush(
        encodedKey,
        encrypt(JSON.stringify(gift), 'wx-other-app'),
        appId,
      ),
    ).toThrow('receiver');
  });
  it('rejects malformed ciphertext and a corrupted final block', () => {
    expect(() => decryptMessagePush(encodedKey, '%broken', appId)).toThrow();
    const bytes = Buffer.from(encrypt(JSON.stringify(gift)), 'base64');
    bytes[bytes.length - 1] ^= 1;
    expect(() =>
      decryptMessagePush(encodedKey, bytes.toString('base64'), appId),
    ).toThrow();
  });
  it('parses XML, CDATA and multiple goods', () => {
    const xml =
      '<xml><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[minigame_deliver_goods]]></Event><MiniGame><OrderId>xml-order</OrderId><GiftId>xml-gift</GiftId><ToUserOpenid>openid</ToUserOpenid><IsPreview>0</IsPreview><GoodsList><Id>spirit_stones</Id><Num>10</Num></GoodsList><GoodsList><Id><![CDATA[talisman_qi_restore_medium]]></Id><Num>2</Num></GoodsList></MiniGame></xml>';
    expect(parseMessagePush(xml).gift?.goods).toHaveLength(2);
    expect(parseMessagePush(xml).gift?.isPreview).toBe(false);
  });
  it('does not turn unrelated events into gifts', () => {
    expect(
      parseMessagePush(JSON.stringify({ ...gift, Event: 'subscribe' })).gift,
    ).toBeUndefined();
  });
  it('rejects empty, fractional or negative rewards and ambiguous preview flags', () => {
    for (const goods of [
      [],
      [{ Id: 'spirit_stones', Num: 1.5 }],
      [{ Id: 'spirit_stones', Num: -1 }],
    ]) {
      expect(() =>
        parseMessagePush(
          JSON.stringify({
            ...gift,
            MiniGame: { ...gift.MiniGame, GoodsList: goods },
          }),
        ),
      ).toThrow();
    }
    expect(() =>
      parseMessagePush(
        JSON.stringify({
          ...gift,
          MiniGame: { ...gift.MiniGame, IsPreview: 'true' },
        }),
      ),
    ).toThrow();
  });
});
