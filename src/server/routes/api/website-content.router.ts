import type { AppEnv } from '@server/lib/hono/types';
import { getPublishedWebsiteContent } from '@server/lib/repositories/websiteContentRepository';
import { Hono } from 'hono';

const router = new Hono<AppEnv>();

router.get('/', async (c) => {
  const content = await getPublishedWebsiteContent();
  return c.json({ success: true, content });
});

export default router;
