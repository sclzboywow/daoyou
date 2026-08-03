import { getExecutor, type DbExecutor } from '@server/lib/drizzle/db';
import { battleRecordsV3 } from '@server/lib/drizzle/schema';
import { validateBattleRecordV3 } from '@shared/engine/battle-v5/v3';
import type {
  BattleRecordType,
  BattleRecordUnitSummary,
  BattleRecordV3,
  BattleRecordV3Summary,
} from '@shared/types/battle';
import { and, desc, eq, isNull, or, sql, type SQL } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export type BattleRecordV3Row = typeof battleRecordsV3.$inferSelect;

export interface CreateBattleRecordV3Input {
  userId: string;
  cultivatorId: string;
  opponentCultivatorId?: string | null;
  battleType?: BattleRecordType;
  battleResult: BattleRecordV3;
}

export interface ListBattleRecordV3Input {
  cultivatorId: string;
  page: number;
  pageSize: number;
  type?: 'challenge' | 'challenged' | null;
}

export interface ListBattleRecordV3Result {
  data: BattleRecordV3Summary[];
  hasMore: boolean;
}

export interface BattleRecordV3ShareResult {
  record: BattleRecordV3Row;
  shareCode: string;
  created: boolean;
}

const summaryFields = {
  id: battleRecordsV3.id,
  cultivatorId: battleRecordsV3.cultivatorId,
  opponentCultivatorId: battleRecordsV3.opponentCultivatorId,
  createdAt: battleRecordsV3.createdAt,
  winner: sql<BattleRecordUnitSummary>`jsonb_build_object(
    'id', ${battleRecordsV3.battleResult} #>> '{outcome,winner,id}',
    'name', ${battleRecordsV3.battleResult} #>> '{outcome,winner,name}'
  )`,
  loser: sql<BattleRecordUnitSummary>`jsonb_build_object(
    'id', ${battleRecordsV3.battleResult} #>> '{outcome,loser,id}',
    'name', ${battleRecordsV3.battleResult} #>> '{outcome,loser,name}'
  )`,
  turns: sql<number>`(${battleRecordsV3.battleResult} #>> '{outcome,turns}')::int`,
};

type SummaryRow = {
  id: string;
  cultivatorId: string;
  opponentCultivatorId: string | null;
  createdAt: Date;
  winner: BattleRecordUnitSummary;
  loser: BattleRecordUnitSummary;
  turns: number | null;
};

export async function createBattleRecordV3(
  input: CreateBattleRecordV3Input,
  q: DbExecutor = getExecutor(),
): Promise<{ id: string }> {
  validateBattleRecordV3(input.battleResult);
  const [row] = await q
    .insert(battleRecordsV3)
    .values({
      userId: input.userId,
      cultivatorId: input.cultivatorId,
      opponentCultivatorId: input.opponentCultivatorId ?? null,
      battleType: input.battleType ?? 'normal',
      battleResult: input.battleResult,
    })
    .returning({ id: battleRecordsV3.id });
  return row;
}

async function listSummaryRows(
  whereCondition: SQL,
  limit: number,
  offset: number,
  q: DbExecutor,
): Promise<SummaryRow[]> {
  return q
    .select(summaryFields)
    .from(battleRecordsV3)
    .where(whereCondition)
    .orderBy(desc(battleRecordsV3.createdAt))
    .limit(limit)
    .offset(offset);
}

function toSummary(
  row: SummaryRow,
  cultivatorId: string,
): BattleRecordV3Summary {
  return {
    id: row.id,
    createdAt: row.createdAt,
    battleType:
      row.opponentCultivatorId && row.cultivatorId === cultivatorId
        ? 'challenge'
        : row.opponentCultivatorId
          ? 'challenged'
          : 'normal',
    opponentCultivatorId: row.opponentCultivatorId,
    winner: row.winner,
    loser: row.loser,
    turns: Number(row.turns ?? 0),
  };
}

export async function listBattleRecordV3Summaries(
  input: ListBattleRecordV3Input,
  q: DbExecutor = getExecutor(),
): Promise<ListBattleRecordV3Result> {
  const offset = (input.page - 1) * input.pageSize;
  const limit = input.pageSize + 1;
  let rows: SummaryRow[];

  if (input.type === 'challenge') {
    rows = await listSummaryRows(
      eq(battleRecordsV3.cultivatorId, input.cultivatorId),
      limit,
      offset,
      q,
    );
  } else if (input.type === 'challenged') {
    rows = await listSummaryRows(
      eq(battleRecordsV3.opponentCultivatorId, input.cultivatorId),
      limit,
      offset,
      q,
    );
  } else {
    rows = await listSummaryRows(
      or(
        eq(battleRecordsV3.cultivatorId, input.cultivatorId),
        eq(battleRecordsV3.opponentCultivatorId, input.cultivatorId),
      )!,
      limit,
      offset,
      q,
    );
  }

  const hasMore = rows.length > input.pageSize;
  return {
    data: (hasMore ? rows.slice(0, input.pageSize) : rows).map((row) =>
      toSummary(row, input.cultivatorId),
    ),
    hasMore,
  };
}

export async function getBattleRecordV3ByIdForCultivator(
  id: string,
  cultivatorId: string,
  q: DbExecutor = getExecutor(),
): Promise<BattleRecordV3Row | null> {
  const [row] = await q
    .select()
    .from(battleRecordsV3)
    .where(
      and(
        eq(battleRecordsV3.id, id),
        or(
          eq(battleRecordsV3.cultivatorId, cultivatorId),
          eq(battleRecordsV3.opponentCultivatorId, cultivatorId),
        ),
      ),
    )
    .limit(1);
  if (!row) return null;
  validateBattleRecordV3(row.battleResult);
  return row;
}

export async function ensureBattleRecordV3Share(
  id: string,
  cultivatorId: string,
  q: DbExecutor = getExecutor(),
): Promise<BattleRecordV3ShareResult | null> {
  const current = await getBattleRecordV3ByIdForCultivator(id, cultivatorId, q);
  if (!current) return null;
  if (current.shareCode) {
    return { record: current, shareCode: current.shareCode, created: false };
  }

  const shareCode = randomUUID();
  const [updated] = await q
    .update(battleRecordsV3)
    .set({ shareCode, sharedAt: new Date() })
    .where(
      and(
        eq(battleRecordsV3.id, id),
        isNull(battleRecordsV3.shareCode),
        or(
          eq(battleRecordsV3.cultivatorId, cultivatorId),
          eq(battleRecordsV3.opponentCultivatorId, cultivatorId),
        ),
      ),
    )
    .returning();

  if (updated) {
    validateBattleRecordV3(updated.battleResult);
    return { record: updated, shareCode, created: true };
  }

  const raced = await getBattleRecordV3ByIdForCultivator(id, cultivatorId, q);
  return raced?.shareCode
    ? { record: raced, shareCode: raced.shareCode, created: false }
    : null;
}

export async function getSharedBattleRecordV3ByCode(
  shareCode: string,
  q: DbExecutor = getExecutor(),
): Promise<BattleRecordV3Row | null> {
  const [row] = await q
    .select()
    .from(battleRecordsV3)
    .where(eq(battleRecordsV3.shareCode, shareCode))
    .limit(1);
  if (!row?.shareCode) return null;
  validateBattleRecordV3(row.battleResult);
  return row;
}
