import { getExecutor, type DbExecutor } from '@server/lib/drizzle/db';
import { towerEnemyFloors } from '@server/lib/drizzle/schema';
import type {
  TowerPreparedEnemy,
  TowerPreparedEnemySetStatus,
} from '@shared/lib/tower';
import type { RealmType } from '@shared/types/constants';
import { and, asc, desc, eq, lt } from 'drizzle-orm';

export type TowerEnemyFloorRecord = typeof towerEnemyFloors.$inferSelect;
export type TowerEnemyFloorSummaryRecord = Pick<
  TowerEnemyFloorRecord,
  | 'seasonKey'
  | 'realm'
  | 'floor'
  | 'status'
  | 'schemaVersion'
  | 'generatedAt'
  | 'updatedAt'
  | 'errorMessage'
>;

export async function findTowerEnemyFloor(args: {
  seasonKey: string;
  realm: RealmType;
  floor: number;
  status?: TowerPreparedEnemySetStatus;
  q?: DbExecutor;
}): Promise<TowerEnemyFloorRecord | undefined> {
  const q = args.q ?? getExecutor();
  const filters = [
    eq(towerEnemyFloors.seasonKey, args.seasonKey),
    eq(towerEnemyFloors.realm, args.realm),
    eq(towerEnemyFloors.floor, args.floor),
  ];
  if (args.status) {
    filters.push(eq(towerEnemyFloors.status, args.status));
  }

  const [row] = await q
    .select()
    .from(towerEnemyFloors)
    .where(and(...filters))
    .limit(1);

  return row;
}

export async function findLatestReadyTowerEnemyFloor(args: {
  realm: RealmType;
  floor: number;
  beforeSeasonKey?: string;
  q?: DbExecutor;
}): Promise<TowerEnemyFloorRecord | undefined> {
  const q = args.q ?? getExecutor();
  const filters = [
    eq(towerEnemyFloors.realm, args.realm),
    eq(towerEnemyFloors.floor, args.floor),
    eq(towerEnemyFloors.status, 'ready'),
  ];
  if (args.beforeSeasonKey) {
    filters.push(lt(towerEnemyFloors.seasonKey, args.beforeSeasonKey));
  }

  const [row] = await q
    .select()
    .from(towerEnemyFloors)
    .where(and(...filters))
    .orderBy(desc(towerEnemyFloors.generatedAt))
    .limit(1);

  return row;
}

export async function listTowerEnemyFloorSummariesBySeason(args: {
  seasonKey: string;
  q?: DbExecutor;
}): Promise<TowerEnemyFloorSummaryRecord[]> {
  const q = args.q ?? getExecutor();
  return q
    .select({
      seasonKey: towerEnemyFloors.seasonKey,
      realm: towerEnemyFloors.realm,
      floor: towerEnemyFloors.floor,
      status: towerEnemyFloors.status,
      schemaVersion: towerEnemyFloors.schemaVersion,
      generatedAt: towerEnemyFloors.generatedAt,
      updatedAt: towerEnemyFloors.updatedAt,
      errorMessage: towerEnemyFloors.errorMessage,
    })
    .from(towerEnemyFloors)
    .where(eq(towerEnemyFloors.seasonKey, args.seasonKey))
    .orderBy(asc(towerEnemyFloors.realm), asc(towerEnemyFloors.floor));
}

export async function listTowerEnemyFloorsBySeasonRealm(args: {
  seasonKey: string;
  realm: RealmType;
  q?: DbExecutor;
}): Promise<TowerEnemyFloorRecord[]> {
  const q = args.q ?? getExecutor();
  return q
    .select()
    .from(towerEnemyFloors)
    .where(
      and(
        eq(towerEnemyFloors.seasonKey, args.seasonKey),
        eq(towerEnemyFloors.realm, args.realm),
      ),
    )
    .orderBy(asc(towerEnemyFloors.floor));
}

export async function upsertReadyTowerEnemyFloor(args: {
  seasonKey: string;
  realm: RealmType;
  floor: number;
  enemy: TowerPreparedEnemy;
  generatedAt: Date;
  schemaVersion: number;
  q?: DbExecutor;
}): Promise<void> {
  const q = args.q ?? getExecutor();
  await q
    .insert(towerEnemyFloors)
    .values({
      seasonKey: args.seasonKey,
      realm: args.realm,
      floor: args.floor,
      status: 'ready',
      schemaVersion: args.schemaVersion,
      enemy: args.enemy,
      generatedAt: args.generatedAt,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        towerEnemyFloors.seasonKey,
        towerEnemyFloors.realm,
        towerEnemyFloors.floor,
      ],
      set: {
        status: 'ready',
        schemaVersion: args.schemaVersion,
        enemy: args.enemy,
        generatedAt: args.generatedAt,
        errorMessage: null,
        updatedAt: new Date(),
      },
    });
}

export async function upsertFailedTowerEnemyFloor(args: {
  seasonKey: string;
  realm: RealmType;
  floor: number;
  errorMessage: string;
  q?: DbExecutor;
}): Promise<void> {
  const q = args.q ?? getExecutor();
  await q
    .insert(towerEnemyFloors)
    .values({
      seasonKey: args.seasonKey,
      realm: args.realm,
      floor: args.floor,
      status: 'failed',
      schemaVersion: 1,
      enemy: null,
      errorMessage: args.errorMessage,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        towerEnemyFloors.seasonKey,
        towerEnemyFloors.realm,
        towerEnemyFloors.floor,
      ],
      set: {
        status: 'failed',
        enemy: null,
        errorMessage: args.errorMessage,
        updatedAt: new Date(),
      },
    });
}
