import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { getExecutor, type DbExecutor, type DbTransaction } from '../drizzle/db';
import * as schema from '../drizzle/schema';

const betBattleRuntimeFields = {
  id: schema.betBattles.id,
  creatorId: schema.betBattles.creatorId,
  creatorName: schema.betBattles.creatorName,
  status: schema.betBattles.status,
  minRealm: schema.betBattles.minRealm,
  maxRealm: schema.betBattles.maxRealm,
  taunt: schema.betBattles.taunt,
  creatorStakeSnapshot: schema.betBattles.creatorStakeSnapshot,
  challengerStakeSnapshot: schema.betBattles.challengerStakeSnapshot,
  challengerId: schema.betBattles.challengerId,
  challengerName: schema.betBattles.challengerName,
  winnerCultivatorId: schema.betBattles.winnerCultivatorId,
  battleRecordV3Id: schema.betBattles.battleRecordV3Id,
  expiresAt: schema.betBattles.expiresAt,
  matchedAt: schema.betBattles.matchedAt,
  settledAt: schema.betBattles.settledAt,
  createdAt: schema.betBattles.createdAt,
};

type BetBattleRuntimeField = keyof typeof betBattleRuntimeFields;

export type BetBattleRecord = Pick<
  typeof schema.betBattles.$inferSelect,
  BetBattleRuntimeField
>;
type BetBattleInsert = Pick<
  typeof schema.betBattles.$inferInsert,
  BetBattleRuntimeField
>;
export type BetBattleListingRecord = BetBattleRecord & {
  creatorRealm: string;
  creatorRealmStage: string;
};

function toListingRecord(row: {
  battle: BetBattleRecord;
  creatorRealm: string;
  creatorRealmStage: string;
}): BetBattleListingRecord {
  return {
    ...row.battle,
    creatorRealm: row.creatorRealm,
    creatorRealmStage: row.creatorRealmStage,
  };
}

export interface FindPendingBetBattlesOptions {
  page?: number;
  limit?: number;
}

export async function createBetBattle(
  data: Omit<
    BetBattleInsert,
    'id' | 'createdAt' | 'status'
  > & { status?: 'pending' | 'matched' | 'cancelled' | 'expired' | 'settled' },
  tx?: DbTransaction,
): Promise<BetBattleRecord> {
  const q = getExecutor(tx);
  const [row] = await q
    .insert(schema.betBattles)
    .values({
      ...data,
      status: data.status ?? 'pending',
    })
    .returning(betBattleRuntimeFields);
  return row;
}

export async function findById(
  id: string,
  executor?: DbExecutor,
): Promise<BetBattleRecord | null> {
  const q = executor ?? getExecutor();
  const [row] = await q
    .select(betBattleRuntimeFields)
    .from(schema.betBattles)
    .where(eq(schema.betBattles.id, id))
    .limit(1);
  return row || null;
}

export async function findListingById(
  id: string,
  executor?: DbExecutor,
): Promise<BetBattleListingRecord | null> {
  const q = executor ?? getExecutor();
  const [row] = await q
    .select({
      battle: betBattleRuntimeFields,
      creatorRealm: schema.cultivators.realm,
      creatorRealmStage: schema.cultivators.realm_stage,
    })
    .from(schema.betBattles)
    .innerJoin(
      schema.cultivators,
      eq(schema.betBattles.creatorId, schema.cultivators.id),
    )
    .where(eq(schema.betBattles.id, id))
    .limit(1);
  return row ? toListingRecord(row) : null;
}

export async function countPendingByCreator(
  creatorId: string,
  executor?: DbExecutor,
): Promise<number> {
  const q = executor ?? getExecutor();
  const [row] = await q
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.betBattles)
    .where(
      and(
        eq(schema.betBattles.creatorId, creatorId),
        eq(schema.betBattles.status, 'pending'),
      ),
    );
  return row?.count || 0;
}

export async function findPendingBetBattles(
  options: FindPendingBetBattlesOptions = {},
): Promise<{ listings: BetBattleListingRecord[]; total: number }> {
  const q = getExecutor();
  const page = options.page ?? 1;
  const limit = options.limit ?? 20;

  const whereClause = and(
    eq(schema.betBattles.status, 'pending'),
    gte(schema.betBattles.expiresAt, new Date()),
  );

  const rows = await q
    .select({
      battle: betBattleRuntimeFields,
      creatorRealm: schema.cultivators.realm,
      creatorRealmStage: schema.cultivators.realm_stage,
    })
    .from(schema.betBattles)
    .innerJoin(
      schema.cultivators,
      eq(schema.betBattles.creatorId, schema.cultivators.id),
    )
    .where(whereClause)
    .orderBy(desc(schema.betBattles.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const [countRow] = await q
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.betBattles)
    .where(whereClause);

  return {
    listings: rows.map(toListingRecord),
    total: countRow?.count || 0,
  };
}

export async function findMyBetBattles(
  cultivatorId: string,
  options: FindPendingBetBattlesOptions = {},
): Promise<{ listings: BetBattleListingRecord[]; total: number }> {
  const q = getExecutor();
  const page = options.page ?? 1;
  const limit = options.limit ?? 20;

  const whereClause = sql`${schema.betBattles.creatorId} = ${cultivatorId} OR ${schema.betBattles.challengerId} = ${cultivatorId}`;

  const rows = await q
    .select({
      battle: betBattleRuntimeFields,
      creatorRealm: schema.cultivators.realm,
      creatorRealmStage: schema.cultivators.realm_stage,
    })
    .from(schema.betBattles)
    .innerJoin(
      schema.cultivators,
      eq(schema.betBattles.creatorId, schema.cultivators.id),
    )
    .where(whereClause)
    .orderBy(desc(schema.betBattles.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const [countRow] = await q
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.betBattles)
    .where(whereClause);

  return {
    listings: rows.map(toListingRecord),
    total: countRow?.count || 0,
  };
}

export async function updateBetBattleById(
  tx: DbTransaction,
  id: string,
  patch: Partial<BetBattleInsert>,
): Promise<void> {
  await tx
    .update(schema.betBattles)
    .set(patch)
    .where(eq(schema.betBattles.id, id));
}

export async function transitionPendingBetBattle(
  tx: DbTransaction,
  id: string,
  patch: Partial<BetBattleInsert> & {
    status: 'settled' | 'cancelled' | 'expired';
  },
  creatorId?: string,
): Promise<BetBattleRecord | null> {
  const conditions = [
    eq(schema.betBattles.id, id),
    eq(schema.betBattles.status, 'pending'),
  ];
  if (creatorId) {
    conditions.push(eq(schema.betBattles.creatorId, creatorId));
  }
  const [row] = await tx
    .update(schema.betBattles)
    .set(patch)
    .where(and(...conditions))
    .returning(betBattleRuntimeFields);
  return row ?? null;
}

export async function markExpiredPendingBetBattles(
  tx: DbTransaction,
): Promise<BetBattleRecord[]> {
  return tx
    .update(schema.betBattles)
    .set({ status: 'expired' })
    .where(
      and(
        eq(schema.betBattles.status, 'pending'),
        sql`${schema.betBattles.expiresAt} < NOW()`,
      ),
    )
    .returning(betBattleRuntimeFields);
}
