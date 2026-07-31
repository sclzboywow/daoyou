import {
  redisLockErrorResponse,
  requireActiveCultivatorRef,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  executeYieldCommand,
  YieldCommandError,
} from '@server/lib/services/YieldApplicationService';
import { renderPrompt } from '@server/lib/prompts';
import { streamAiText } from '@server/utils/aiClient';
import { getGameConceptLabel } from '@shared/lib/gameConceptDisplay';
import { Hono } from 'hono';

const yieldRouter = new Hono<AppEnv>();

yieldRouter.post('/', requireActiveCultivatorRef(), async (c) => {
  const user = c.get('user');
  const activeCultivator = c.get('activeCultivatorRef');
  if (!user || !activeCultivator) {
    return c.json({ success: false, error: '未授权访问' }, 401);
  }

  try {
    const { committed, result } = await executeYieldCommand({
      userId: user.id,
      cultivatorId: activeCultivator.cultivatorId,
    });
    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'result',
                data: committed.result,
              })}\n\n`,
            ),
          );
          if (committed.state.changes.length > 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'state',
                  state: committed.state,
                })}\n\n`,
              ),
            );
          }
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
          const aiStreamResult = streamAiText({
            system,
            prompt,
            abortSignal: c.req.raw.signal,
            sceneId: 'yield-story',
          });
          for await (const chunk of aiStreamResult.textStream) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`,
              ),
            );
          }
        } catch (error) {
          console.error('Stream processing error:', error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: '天机推演中断...',
              })}\n\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });
    return new Response(customStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    const lockErrorResponse = redisLockErrorResponse(error);
    if (lockErrorResponse) return lockErrorResponse;
    if (error instanceof YieldCommandError) {
      return c.json(
        { success: false, error: error.message },
        error.status,
      );
    }
    throw error;
  }
});

export default yieldRouter;
