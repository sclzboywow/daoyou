import {
  redisLockErrorResponse,
  requireActiveCultivatorRef,
} from '@server/lib/hono/middleware';
import { streamSseEvents } from '@server/lib/hono/streaming';
import type { AppEnv } from '@server/lib/hono/types';
import {
  executeYieldCommand,
  YieldCommandError,
} from '@server/lib/services/YieldApplicationService';
import { renderPrompt } from '@server/lib/prompts';
import { streamAiText } from '@server/utils/aiClient';
import { getGameConceptLabel } from '@shared/lib/gameConceptDisplay';
import type { YieldRewardMode } from '@shared/lib/rewardedAd';
import {
  consumeRewardedAdCredit,
  releaseRewardedAdCredit,
  reserveRewardedAdCredit,
  RewardedAdVerificationError,
  type RewardedAdReservation,
} from '@server/lib/services/RewardedAdVerificationService';
import { Hono } from 'hono';
import { z } from 'zod';

const yieldRouter = new Hono<AppEnv>();

const yieldBodySchema = z
  .object({
    rewardMode: z.enum(['normal', 'rewarded_double']).optional(),
  })
  .strict();

yieldRouter.post('/', requireActiveCultivatorRef(), async (c) => {
  const user = c.get('user');
  const activeCultivator = c.get('activeCultivatorRef');
  if (!user || !activeCultivator) {
    return c.json({ success: false, error: '未授权访问' }, 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    rawBody = {};
  }
  const body = yieldBodySchema.parse(rawBody ?? {});
  const idempotencyKey = c.req.header('Idempotency-Key')?.trim() || undefined;
  if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 120)) {
    return c.json({ success: false, error: '领取凭证无效' }, 400);
  }
  if (body.rewardMode === 'rewarded_double' && !idempotencyKey) {
    return c.json({ success: false, error: '广告奖励领取凭证无效' }, 400);
  }

  let reservation: RewardedAdReservation | undefined;
  try {
    if (body.rewardMode === 'rewarded_double') {
      reservation = await reserveRewardedAdCredit({
        userId: user.id,
        cultivatorId: activeCultivator.cultivatorId,
        rewardKind: 'yield-double',
        requestId: idempotencyKey!,
      });
    }
    const prepared = await executeYieldCommand({
      userId: user.id,
      cultivatorId: activeCultivator.cultivatorId,
      rewardMode: body.rewardMode as YieldRewardMode | undefined,
      // The client request key is the stable idempotency key across retries.
      // WeChat's transaction id identifies the ad callback and must not be
      // reused as the yield-command replay/cache key.
      idempotencyKey,
    });
    if (reservation) await consumeRewardedAdCredit(reservation);
    return streamSseEvents(c, async (stream) => {
      await stream.writeSSE({
        data: JSON.stringify({ type: 'result', data: prepared.result }),
      });
      if (prepared.replayed) {
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'chunk',
            text: '这笔历练此前已经入账。',
          }),
        });
        return;
      }
      if (prepared.committed.state.changes.length > 0) {
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'state',
            state: prepared.committed.state,
          }),
        });
      }

      const result = prepared.result;
      const { system, user: prompt } = renderPrompt('yield-story', {
        cultivatorRealm: result.cultivatorRealm,
        cultivatorName: result.cultivatorName,
        amount: result.amount,
        extraYieldText: (() => {
          const extra = [
            result.expGain ? `修为精进 ${result.expGain} 点` : '',
            result.insightGain
              ? `${getGameConceptLabel('comprehension_insight')} ${result.insightGain} 点`
              : '',
          ]
            .filter(Boolean)
            .join('；');
          return extra ? `；${extra}` : '';
        })(),
      });

      try {
        const aiStreamResult = streamAiText({
          system,
          prompt,
          abortSignal: c.req.raw.signal,
          sceneId: 'yield-story',
        });
        for await (const chunk of aiStreamResult.textStream) {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'chunk', text: chunk }),
          });
        }
      } catch (error) {
        console.error('Stream processing error:', error);
        await stream.writeSSE({
          data: JSON.stringify({ type: 'error', error: '天机推演中断...' }),
        });
      }
    });
  } catch (error) {
    if (reservation) await releaseRewardedAdCredit(reservation);
    const lockErrorResponse = redisLockErrorResponse(error);
    if (lockErrorResponse) return lockErrorResponse;
    if (error instanceof YieldCommandError) {
      return c.json(
        { success: false, error: error.message },
        error.status,
      );
    }
    if (error instanceof RewardedAdVerificationError) {
      return c.json(
        { success: false, error: error.message, code: error.code },
        error.status,
      );
    }
    throw error;
  }
});

export default yieldRouter;
