import { redis } from '@server/lib/redis';
import { parseRedisJson } from '@server/lib/redis/json';
import type { AppEnv } from '@server/lib/hono/types';
import { generateAiObject } from '@server/utils/aiClient';
import {
  getDivineFortunePrompt,
  getRandomFallbackFortune,
} from '@server/utils/divineFortune';
import {
  DivineFortuneSchema,
  type DivineFortune,
} from '@shared/lib/divineFortune';
import { Hono } from 'hono';

const CACHE_KEY = 'divine_fortune_data';
const CACHE_TTL = 60 * 60 * 24;

const router = new Hono<AppEnv>();

router.get('/', async (c) => {
  try {
    const cachedRaw = await redis.get(CACHE_KEY);
    const cachedFortune = parseRedisJson<DivineFortune>(cachedRaw, CACHE_KEY);
    if (cachedRaw && !cachedFortune) {
      await redis.del(CACHE_KEY);
    }

    if (cachedFortune) {
      return c.json({
        success: true,
        data: cachedFortune,
        cached: true,
      });
    }

    const [systemPrompt, userPrompt] = getDivineFortunePrompt();
    const aiResponse = await generateAiObject({
      system: systemPrompt,
      prompt: userPrompt,
      schema: DivineFortuneSchema,
      name: 'DivineFortune',
      sceneId: 'divine-fortune',
    });

    const fortune = aiResponse.output;
    await redis.set(CACHE_KEY, JSON.stringify(fortune), 'EX', CACHE_TTL);

    return c.json({
      success: true,
      data: fortune,
    });
  } catch (error) {
    console.error('天机推演 API 错误:', error);
    return c.json({
      success: true,
      data: getRandomFallbackFortune(),
      fallback: true,
    });
  }
});

export default router;
