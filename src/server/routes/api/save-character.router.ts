import { requireUser } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  createCultivatorFromTemp,
  CultivatorCreationCommandError,
} from '@server/lib/services/CultivatorCreationApplicationService';
import { toPlayerStateMutationResponse } from '@server/lib/services/ResourceMutationResponse';
import { Hono } from 'hono';
import { z } from 'zod';

const SaveCharacterSchema = z.object({
  tempCultivatorId: z.string(),
  selectedFateIndices: z.array(z.number()).length(3),
});

const router = new Hono<AppEnv>();

router.post('/', requireUser(), async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: '未授权访问' }, 401);
  }

  const { tempCultivatorId, selectedFateIndices } = SaveCharacterSchema.parse(
    await c.req.json(),
  );

  try {
    const committed = await createCultivatorFromTemp({
      userId: user.id,
      tempCultivatorId,
      selectedFateIndices,
    });
    return c.json(toPlayerStateMutationResponse(committed));
  } catch (error) {
    if (error instanceof CultivatorCreationCommandError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

export default router;
