import { getExecutor, type DbExecutor, type DbTransaction } from '@server/lib/drizzle/db';
import * as schema from '@server/lib/drizzle/schema';
import { and, asc, eq, sql } from 'drizzle-orm';
import { mapConsumableRow } from './consumablePersistence';

export class TalismanScenarioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TalismanScenarioError';
  }
}

export async function consumeFirstTalismanByScenario(
  cultivatorId: string,
  scenario: string,
  executor?: DbExecutor | DbTransaction,
): Promise<{
  itemId: string;
  remaining: ReturnType<typeof mapConsumableRow> | null;
}> {
  const q = executor ?? getExecutor();
  const rows = await q
    .select()
    .from(schema.consumables)
    .where(
      and(
        eq(schema.consumables.cultivatorId, cultivatorId),
        eq(schema.consumables.type, '符箓'),
        sql`${schema.consumables.quantity} > 0`,
        sql`${schema.consumables.spec}->>'kind' = 'talisman'`,
        sql`${schema.consumables.spec}->>'scenario' = ${scenario}`,
      ),
    )
    .orderBy(asc(schema.consumables.createdAt), asc(schema.consumables.id))
    .limit(1);

  const row = rows[0];

  if (!row) {
    throw new TalismanScenarioError('缺少对应符箓，无法完成此操作');
  }

  if (row.quantity <= 1) {
    await q
      .delete(schema.consumables)
      .where(eq(schema.consumables.id, row.id));
    return { itemId: row.id, remaining: null };
  }

  const [updated] = await q
    .update(schema.consumables)
    .set({ quantity: row.quantity - 1 })
    .where(eq(schema.consumables.id, row.id))
    .returning();
  return {
    itemId: row.id,
    remaining: updated ? mapConsumableRow(updated) : null,
  };
}
