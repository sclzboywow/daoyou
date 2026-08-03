import {
  getValidatedQuery,
  requireActiveCultivatorRef,
  validateQuery,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  ensureBattleRecordV3Share,
  getBattleRecordV3ByIdForCultivator,
  getSharedBattleRecordV3ByCode,
  listBattleRecordV3Summaries,
} from '@server/lib/repositories/battleRecordV3Repository';
import { toPublicBattleReplayV1 } from '@shared/lib/battle/publicBattleReplay';
import { Hono } from 'hono';
import { z } from 'zod';

const router = new Hono<AppEnv>();
const UuidSchema = z.string().uuid();

const BattleRecordListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(5).default(5),
  type: z.enum(['challenge', 'challenged']).optional(),
});

type BattleRecordListQuery = z.infer<typeof BattleRecordListQuerySchema>;

router.get('/shared/:shareCode', async (c) => {
  const parsedCode = UuidSchema.safeParse(c.req.param('shareCode'));
  if (!parsedCode.success) {
    return c.json({ success: false, error: '记录不存在' }, 404);
  }
  const record = await getSharedBattleRecordV3ByCode(parsedCode.data);
  if (!record?.shareCode) {
    return c.json({ success: false, error: '记录不存在' }, 404);
  }

  return c.json({
    success: true,
    data: {
      shareCode: record.shareCode,
      createdAt: record.createdAt.toISOString(),
      winner: record.battleResult.outcome.winner,
      loser: record.battleResult.outcome.loser,
      turns: record.battleResult.outcome.turns,
      battleResult: toPublicBattleReplayV1(record.battleResult),
    },
  });
});

router.get(
  '/v3',
  requireActiveCultivatorRef(),
  validateQuery(BattleRecordListQuerySchema),
  async (c) => {
    const { page, pageSize, type } =
      getValidatedQuery<BattleRecordListQuery>(c);
    const activeRef = c.get('activeCultivatorRef');
    if (!activeRef) {
      return c.json({ success: false, error: '当前没有活跃角色' }, 404);
    }
    const result = await listBattleRecordV3Summaries({
      cultivatorId: activeRef.cultivatorId,
      page,
      pageSize,
      type: type ?? null,
    });

    return c.json({
      success: true,
      data: result.data,
      pagination: {
        page,
        pageSize,
        hasMore: result.hasMore,
      },
    });
  },
);

router.get('/v3/:id', requireActiveCultivatorRef(), async (c) => {
  const activeRef = c.get('activeCultivatorRef');
  if (!activeRef) {
    return c.json({ success: false, error: '当前没有活跃角色' }, 404);
  }
  const record = await getBattleRecordV3ByIdForCultivator(
    c.req.param('id'),
    activeRef.cultivatorId,
  );

  if (!record) {
    return c.json({ success: false, error: '记录不存在' }, 404);
  }

  return c.json({
    success: true,
    data: {
      id: record.id,
      createdAt: record.createdAt,
      battleResult: record.battleResult,
    },
  });
});

router.post('/v3/:id/share', requireActiveCultivatorRef(), async (c) => {
  const activeRef = c.get('activeCultivatorRef');
  const parsedId = UuidSchema.safeParse(c.req.param('id'));
  if (!activeRef || !parsedId.success) {
    return c.json({ success: false, error: '记录不存在' }, 404);
  }
  const result = await ensureBattleRecordV3Share(
    parsedId.data,
    activeRef.cultivatorId,
  );
  if (!result) {
    return c.json({ success: false, error: '记录不存在' }, 404);
  }

  return c.json({
    success: true,
    data: {
      shareCode: result.shareCode,
      sharePath: `/battle-replay/${result.shareCode}`,
      created: result.created,
    },
  });
});

export default router;
