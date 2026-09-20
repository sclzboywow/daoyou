import { db } from '@server/lib/drizzle/db';
import { rewardedAdCallbacks } from '@server/lib/drizzle/schema';
import type { RewardedAdKind } from '@shared/lib/rewardedAd';
import { and, asc, eq, lt, sql } from 'drizzle-orm';
import {
  createDecipheriv,
  createHash,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

const RESERVATION_TTL_MS = 5 * 60 * 1000;
const CALLBACK_WAIT_ATTEMPTS = 8;
const CALLBACK_WAIT_INTERVAL_MS = 250;
const REWARD_KINDS = new Set<RewardedAdKind>(['battle-heal', 'yield-double']);

export class RewardedAdVerificationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 404 | 409 | 503,
    readonly code: string,
  ) {
    super(message);
    this.name = 'RewardedAdVerificationError';
  }
}

function callbackConfig() {
  const token = process.env.WECHAT_AD_REWARD_CALLBACK_TOKEN?.trim();
  const encodedKey = process.env.WECHAT_AD_REWARD_CALLBACK_AES_KEY?.trim();
  if (!token || !encodedKey) {
    throw new RewardedAdVerificationError(
      '广告奖励回调尚未配置',
      503,
      'REWARDED_AD_CALLBACK_NOT_CONFIGURED',
    );
  }
  const aesKey = Buffer.from(`${encodedKey}=`, 'base64');
  if (!/^[A-Za-z0-9]{43}$/.test(encodedKey) || aesKey.length !== 32) {
    throw new RewardedAdVerificationError(
      '广告奖励回调密钥无效',
      503,
      'REWARDED_AD_CALLBACK_KEY_INVALID',
    );
  }
  return { token, aesKey };
}

function signaturePartBytes(part: string | Buffer) {
  return Buffer.isBuffer(part) ? part : Buffer.from(part, 'utf8');
}

function sha256Signature(parts: Array<string | Buffer>) {
  const sorted = parts
    .map((part) => ({ part, bytes: signaturePartBytes(part) }))
    .sort((left, right) => Buffer.compare(left.bytes, right.bytes));
  return createHash('sha256')
    .update(Buffer.concat(sorted.map(({ bytes }) => bytes)))
    .digest('hex');
}

function signaturesMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual.toLowerCase(), 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return !(
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function assertSignature(actual: string, expected: string) {
  if (!signaturesMatch(actual, expected)) {
    throw new RewardedAdVerificationError(
      '广告奖励回调签名无效',
      401,
      'REWARDED_AD_CALLBACK_SIGNATURE_INVALID',
    );
  }
}

function urlDecodedBytes(value: string) {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (
      value[index] === '%' &&
      /^[0-9a-f]{2}$/i.test(value.slice(index + 1, index + 3))
    ) {
      bytes.push(Number.parseInt(value.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    bytes.push(value.charCodeAt(index));
  }
  return Buffer.from(bytes);
}

function formUrlDecodedBytes(value: string) {
  return urlDecodedBytes(value.replace(/\+/g, ' '));
}

function decodedEncryptedParam(encrypted: string) {
  return /%[0-9a-f]{2}/i.test(encrypted)
    ? urlDecodedBytes(encrypted)
    : Buffer.from(encrypted, 'base64');
}

function callbackEncryptedCandidates(
  encrypted: string,
  variants: string[] = [],
) {
  return new Set([
    encrypted,
    decodedEncryptedParam(encrypted),
    formUrlDecodedBytes(encrypted),
    ...variants,
  ]);
}

function assertCallbackSignature(input: {
  actual: string;
  token: string;
  timestamp: string;
  nonce: string;
  encrypted: string;
  encryptedVariants?: string[];
}) {
  const encryptedCandidates = callbackEncryptedCandidates(
    input.encrypted,
    input.encryptedVariants,
  );
  const valid = [...encryptedCandidates].some((encrypted) =>
    signaturesMatch(
      input.actual,
      sha256Signature([input.token, input.timestamp, input.nonce, encrypted]),
    ),
  );
  if (!valid) {
    throw new RewardedAdVerificationError(
      '广告奖励回调签名无效',
      401,
      'REWARDED_AD_CALLBACK_SIGNATURE_INVALID',
    );
  }
}

export function verifyRewardedAdCallbackEcho(input: {
  signature: string;
  timestamp: string;
  nonce: string;
}): void {
  const { token } = callbackConfig();
  assertSignature(
    input.signature,
    sha256Signature([token, input.timestamp, input.nonce]),
  );
}

function decryptCallback(encrypted: string, aesKey: Buffer): string {
  const bytes = /%[0-9a-f]{2}/i.test(encrypted)
    ? formUrlDecodedBytes(encrypted)
    : decodedEncryptedParam(encrypted);
  if (bytes.length <= 16) {
    throw new RewardedAdVerificationError(
      '广告奖励回调密文无效',
      400,
      'REWARDED_AD_CALLBACK_ENCRYPT_INVALID',
    );
  }
  try {
    const decipher = createDecipheriv(
      'aes-256-cbc',
      aesKey,
      bytes.subarray(0, 16),
    );
    return Buffer.concat([
      decipher.update(bytes.subarray(16)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new RewardedAdVerificationError(
      '广告奖励回调解密失败',
      400,
      'REWARDED_AD_CALLBACK_DECRYPT_FAILED',
    );
  }
}

function parseCallbackPayload(raw: string) {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new RewardedAdVerificationError(
      '广告奖励回调内容不是有效 JSON',
      400,
      'REWARDED_AD_CALLBACK_JSON_INVALID',
    );
  }
  if (!payload || typeof payload !== 'object') {
    throw new RewardedAdVerificationError(
      '广告奖励回调内容无效',
      400,
      'REWARDED_AD_CALLBACK_PAYLOAD_INVALID',
    );
  }
  const record = payload as Record<string, unknown>;
  const transactionId = String(record.transaction_id ?? '').trim();
  const callbackUserId = String(record.user_id ?? '').trim();
  const rewardKind = String(record.reward_item ?? '').trim() as RewardedAdKind;
  const rewardAmount = Number(record.reward_amount);
  const customData = String(record.custom_data ?? '').trim();
  if (
    !transactionId ||
    !callbackUserId ||
    !REWARD_KINDS.has(rewardKind) ||
    !Number.isSafeInteger(rewardAmount) ||
    rewardAmount !== 1 ||
    customData.length < 8 ||
    customData.length > 120
  ) {
    throw new RewardedAdVerificationError(
      '广告奖励回调字段无效',
      400,
      'REWARDED_AD_CALLBACK_FIELDS_INVALID',
    );
  }
  return {
    transactionId,
    callbackUserId,
    rewardKind,
    rewardAmount,
    customData,
  };
}

export async function receiveRewardedAdCallback(input: {
  signature: string;
  timestamp: string;
  nonce: string;
  encrypted: string;
  encryptedVariants?: string[];
}) {
  const config = callbackConfig();
  try {
    assertCallbackSignature({
      actual: input.signature,
      token: config.token,
      timestamp: input.timestamp,
      nonce: input.nonce,
      encrypted: input.encrypted,
      encryptedVariants: input.encryptedVariants,
    });
  } catch (error) {
    if (
      error instanceof RewardedAdVerificationError &&
      error.code === 'REWARDED_AD_CALLBACK_SIGNATURE_INVALID'
    ) {
      const candidates = callbackEncryptedCandidates(
        input.encrypted,
        input.encryptedVariants,
      );
      let decryptable = false;
      try {
        decryptCallback(input.encrypted, config.aesKey);
        decryptable = true;
      } catch {
        // Diagnostic only. The original signature failure remains authoritative.
      }
      console.warn('[rewarded-ad-callback] signature mismatch', {
        actual: input.signature,
        expected: [...candidates].map((encrypted) =>
          sha256Signature([
            config.token,
            input.timestamp,
            input.nonce,
            encrypted,
          ]),
        ),
        encryptedLengths: [...candidates].map((value) => value.length),
        decryptable,
      });
    }
    throw error;
  }
  const payload = parseCallbackPayload(
    decryptCallback(input.encrypted, config.aesKey),
  );
  const [created] = await db
    .insert(rewardedAdCallbacks)
    .values({
      transactionId: payload.transactionId,
      callbackUserId: payload.callbackUserId,
      rewardKind: payload.rewardKind,
      rewardAmount: payload.rewardAmount,
      customData: payload.customData,
      claimRequestId: payload.customData,
    })
    .onConflictDoNothing({ target: rewardedAdCallbacks.transactionId })
    .returning({ id: rewardedAdCallbacks.id });
  return { accepted: true, duplicate: !created };
}

export type RewardedAdReservation = {
  callbackId: string;
  transactionId: string;
  reservationToken: string;
  alreadyConsumed: boolean;
};

export async function reserveRewardedAdCredit(input: {
  userId: string;
  cultivatorId: string;
  rewardKind: RewardedAdKind;
  requestId: string;
}): Promise<RewardedAdReservation> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`rewarded-ad:${input.userId}`}))`,
    );
    const [existing] = await tx
      .select({
        id: rewardedAdCallbacks.id,
        transactionId: rewardedAdCallbacks.transactionId,
        reservationToken: rewardedAdCallbacks.reservationToken,
        status: rewardedAdCallbacks.status,
      })
      .from(rewardedAdCallbacks)
      .where(
        and(
          eq(rewardedAdCallbacks.callbackUserId, input.userId),
          eq(rewardedAdCallbacks.rewardKind, input.rewardKind),
          eq(rewardedAdCallbacks.claimRequestId, input.requestId),
        ),
      )
      .limit(1);
    if (existing?.status === 'consumed' && existing.reservationToken) {
      return {
        callbackId: existing.id,
        transactionId: existing.transactionId,
        reservationToken: existing.reservationToken,
        alreadyConsumed: true,
      };
    }
    const staleBefore = new Date(Date.now() - RESERVATION_TTL_MS);
    await tx
      .update(rewardedAdCallbacks)
      .set({
        status: 'pending',
        reservationToken: null,
        reservedAt: null,
        consumerUserId: null,
        consumerCultivatorId: null,
      })
      .where(
        and(
          eq(rewardedAdCallbacks.callbackUserId, input.userId),
          eq(rewardedAdCallbacks.rewardKind, input.rewardKind),
          eq(rewardedAdCallbacks.claimRequestId, input.requestId),
          eq(rewardedAdCallbacks.status, 'reserved'),
          lt(rewardedAdCallbacks.reservedAt, staleBefore),
        ),
      );
    let credit: { id: string; transactionId: string } | undefined;
    for (let attempt = 0; attempt < CALLBACK_WAIT_ATTEMPTS; attempt += 1) {
      [credit] = await tx
        .select({
          id: rewardedAdCallbacks.id,
          transactionId: rewardedAdCallbacks.transactionId,
        })
        .from(rewardedAdCallbacks)
        .where(
          and(
            eq(rewardedAdCallbacks.callbackUserId, input.userId),
            eq(rewardedAdCallbacks.rewardKind, input.rewardKind),
            eq(rewardedAdCallbacks.claimRequestId, input.requestId),
            eq(rewardedAdCallbacks.status, 'pending'),
          ),
        )
        .orderBy(asc(rewardedAdCallbacks.receivedAt))
        .limit(1);
      if (credit || attempt === CALLBACK_WAIT_ATTEMPTS - 1) break;
      await new Promise((resolve) =>
        setTimeout(resolve, CALLBACK_WAIT_INTERVAL_MS),
      );
    }
    if (!credit) {
      throw new RewardedAdVerificationError(
        '尚未收到微信广告奖励确认，请稍后重试',
        409,
        'REWARDED_AD_CALLBACK_PENDING',
      );
    }
    const reservationToken = randomUUID();
    await tx
      .update(rewardedAdCallbacks)
      .set({
        status: 'reserved',
        reservationToken,
        reservedAt: new Date(),
        consumerUserId: input.userId,
        consumerCultivatorId: input.cultivatorId,
      })
      .where(eq(rewardedAdCallbacks.id, credit.id));
    return {
      callbackId: credit.id,
      transactionId: credit.transactionId,
      reservationToken,
      alreadyConsumed: false,
    };
  });
}

export async function consumeRewardedAdCredit(
  reservation: RewardedAdReservation,
) {
  if (reservation.alreadyConsumed) return;
  const [consumed] = await db
    .update(rewardedAdCallbacks)
    .set({ status: 'consumed', consumedAt: new Date() })
    .where(
      and(
        eq(rewardedAdCallbacks.id, reservation.callbackId),
        eq(rewardedAdCallbacks.status, 'reserved'),
        eq(rewardedAdCallbacks.reservationToken, reservation.reservationToken),
      ),
    )
    .returning({ id: rewardedAdCallbacks.id });
  if (!consumed) {
    throw new RewardedAdVerificationError(
      '广告奖励凭证状态已变化',
      409,
      'REWARDED_AD_RESERVATION_LOST',
    );
  }
}

export async function releaseRewardedAdCredit(
  reservation: RewardedAdReservation,
) {
  if (reservation.alreadyConsumed) return;
  await db
    .update(rewardedAdCallbacks)
    .set({
      status: 'pending',
      reservationToken: null,
      reservedAt: null,
      consumerUserId: null,
      consumerCultivatorId: null,
    })
    .where(
      and(
        eq(rewardedAdCallbacks.id, reservation.callbackId),
        eq(rewardedAdCallbacks.status, 'reserved'),
        eq(rewardedAdCallbacks.reservationToken, reservation.reservationToken),
      ),
    );
}

export const rewardedAdVerificationInternals = {
  assertCallbackSignature,
  decryptCallback,
  parseCallbackPayload,
  sha256Signature,
};
