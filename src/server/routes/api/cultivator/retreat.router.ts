import {
  redisLockErrorResponse,
  requireActiveCultivatorRef,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  executeRetreatCommand,
  RetreatCommandError,
  type RetreatStorySource,
} from '@server/lib/services/RetreatApplicationService';
import {
  QiInsufficientError,
  QiServiceError,
} from '@server/lib/services/QiService';
import { streamAiText } from '@server/utils/aiClient';
import {
  getBreakthroughStoryPrompt,
  getLifespanExhaustedStoryPrompt,
} from '@server/utils/prompts';
import type { PlayerResourceMutationMeta } from '@shared/contracts/player';
import type {
  RetreatResultData,
  RetreatStreamEvent,
} from '@shared/contracts/retreat';
import { Hono, type Context } from 'hono';
import { z } from 'zod';

const RetreatSchema = z.object({
  years: z.number().optional(),
  action: z.enum(['cultivate', 'breakthrough']).default('cultivate'),
});

function qiErrorResponse(c: Context<AppEnv>, error: unknown) {
  if (error instanceof QiInsufficientError) {
    return c.json(
      {
        error: error.code,
        message: error.message,
        required: error.required,
        current: error.current,
        action: error.action,
      },
      409,
    );
  }
  if (error instanceof QiServiceError) {
    return c.json({ error: error.message }, error.status as 400 | 404 | 409);
  }
  return null;
}

function encodeSseEvent(
  encoder: TextEncoder,
  event: RetreatStreamEvent,
): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

function createRetreatStreamResponse(args: {
  result: RetreatResultData;
  state?: PlayerResourceMutationMeta;
  storySource: RetreatStorySource;
  abortSignal: AbortSignal;
  onStoryComplete?: (story: string) => Promise<void> | void;
}): Response {
  const encoder = new TextEncoder();
  const customStream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encodeSseEvent(encoder, { type: 'result', data: args.result }),
      );
      if (args.state?.changes.length) {
        controller.enqueue(
          encodeSseEvent(encoder, { type: 'state', state: args.state }),
        );
      }
      if (!args.storySource) {
        controller.close();
        return;
      }

      let accumulatedStory = '';
      try {
        const prompt =
          args.storySource.type === 'breakthrough'
            ? getBreakthroughStoryPrompt(args.storySource.payload)
            : getLifespanExhaustedStoryPrompt(args.storySource.payload);
        const aiStreamResult = streamAiText({
          system: prompt[0],
          prompt: prompt[1],
          abortSignal: args.abortSignal,
          sceneId:
            args.storySource.type === 'breakthrough'
              ? 'breakthrough-story'
              : 'lifespan-exhausted',
        });
        for await (const chunk of aiStreamResult.textStream) {
          accumulatedStory += chunk;
          controller.enqueue(
            encodeSseEvent(encoder, { type: 'chunk', text: chunk }),
          );
        }
      } catch (error) {
        console.error('Retreat story stream error:', error);
        controller.enqueue(
          encodeSseEvent(encoder, {
            type: 'error',
            error: '天机推演中断，此番结果已然落定。',
          }),
        );
      } finally {
        try {
          await args.onStoryComplete?.(accumulatedStory);
        } catch (persistError) {
          console.error('Retreat story persist error:', persistError);
        }
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
}

const retreatRouter = new Hono<AppEnv>();

retreatRouter.post('/', requireActiveCultivatorRef(), async (c) => {
  const user = c.get('user');
  const activeCultivator = c.get('activeCultivatorRef');
  if (!user || !activeCultivator) {
    return c.json({ error: '未授权访问' }, 401);
  }

  try {
    const { years: inputYears, action } = RetreatSchema.parse(
      await c.req.json(),
    );
    const execution = await executeRetreatCommand({
      userId: user.id,
      cultivatorId: activeCultivator.cultivatorId,
      action,
      years: inputYears ?? 0,
    });
    return createRetreatStreamResponse({
      result: execution.committed.result,
      state: execution.committed.state,
      storySource: execution.storySource,
      abortSignal: c.req.raw.signal,
      onStoryComplete: execution.onStoryComplete,
    });
  } catch (error) {
    const lockErrorResponse = redisLockErrorResponse(error);
    if (lockErrorResponse) return lockErrorResponse;
    const qiResponse = qiErrorResponse(c, error);
    if (qiResponse) return qiResponse;
    if (error instanceof RetreatCommandError) {
      return c.json(
        { success: false, error: error.message, ...error.payload },
        error.status,
      );
    }
    console.error('闭关突破 API 错误:', error);
    throw error;
  }
});

export default retreatRouter;
