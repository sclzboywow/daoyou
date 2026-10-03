import { JournalRequestSchema } from '@shared/contracts/playerJournal';
import {
  redisLockErrorResponse,
  requireActiveCultivatorRef,
  validateJson,
  getValidatedJson,
} from '@server/lib/hono/middleware';
import { streamSseEvents } from '@server/lib/hono/streaming';
import type { AppEnv } from '@server/lib/hono/types';
import { renderPrompt } from '@server/lib/prompts';
import { RewardedAdError } from '@server/lib/services/RewardedAdApplicationService';
import {
  executeYieldCommand,
  YieldCommandError,
} from '@server/lib/services/YieldApplicationService';
import { streamAiText } from '@server/utils/aiClient';
import { YieldAdClaimSchema } from '@shared/contracts/rewardedAds';
import { getGameConceptLabel } from '@shared/lib/gameConceptDisplay';
import { Hono } from 'hono';
import { z } from 'zod';

const yieldRouter = new Hono<AppEnv>();

yieldRouter.post('/', requireActiveCultivatorRef(), validateJson(z.union([JournalRequestSchema, JournalRequestSchema.extend({ adTicketId: z.uuid(), adCompleted: z.literal(true) })])), async (c) => {
  const user = c.get('user');
  const activeCultivator = c.get('activeCultivatorRef');
  if (!user || !activeCultivator) {
    return c.json({ success: false, error: '未授权访问' }, 401);
  }

  try {
    const input = YieldAdClaimSchema.parse(
      (() => { const value = getValidatedJson<{adTicketId?:string;adCompleted?:true}>(c); return value.adTicketId ? {adTicketId:value.adTicketId,adCompleted:value.adCompleted} : {}; })(),
    );
    const { committed, result } = await executeYieldCommand({
      userId: user.id,
      cultivatorId: activeCultivator.cultivatorId,
      ...('adTicketId' in input ? { adTicketId: input.adTicketId } : {}),
      requestId: getValidatedJson<{ requestId: string }>(c).requestId,
    });
    return streamSseEvents(c, async (stream, _isAborted, signal) => {
      await stream.writeSSE({
        data: JSON.stringify({ type: 'result', data: committed.result }),
      });
      if (committed.state.changes.length > 0 || committed.state.replayed) {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'state', state: committed.state }),
        });
      }

      if (committed.state.replayed) return;
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
          abortSignal: signal,
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
    if (error instanceof RewardedAdError)
      return c.json({ success: false, error: error.message }, 409);
    const lockErrorResponse = redisLockErrorResponse(error);
    if (lockErrorResponse) return lockErrorResponse;
    if (error instanceof YieldCommandError) {
      return c.json({ success: false, error: error.message }, error.status);
    }
    throw error;
  }
});

export default yieldRouter;
