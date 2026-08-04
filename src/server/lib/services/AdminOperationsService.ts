import {
  getExecutor,
  runDbTasks,
} from '@server/lib/drizzle/db';
import { isTurnstileServerEnabled } from '@server/lib/auth/turnstile';
import {
  cultivators,
  cultivatorTasks,
  dungeonHistories,
  itemLibrary,
  mails,
  reputationShopPurchases,
  sectMemberships,
  sectShopPurchases,
  sectTaskRecords,
  transactionalMessages,
} from '@server/lib/drizzle/schema';
import { DAILY_MATERIAL_LIBRARY_TARGETS } from '@server/lib/services/MaterialLibraryService';
import type {
  AdminOperationsSnapshot,
  AdminOperationsTutorialRow,
} from '@shared/contracts/adminOperations';
import {
  MATERIAL_TYPE_VALUES,
  QUALITY_VALUES,
  type MaterialType,
  type Quality,
} from '@shared/types/constants';
import { and, count, eq, gte, inArray, isNull, sql } from 'drizzle-orm';

const TUTORIAL_TITLES: Record<string, string> = {
  tutorial_starter_supply: '领取新手物资',
  tutorial_first_alchemy: '完成首次炼丹',
  tutorial_first_dungeon: '完成首次秘境',
};

const TUTORIAL_IDS = Object.keys(TUTORIAL_TITLES);

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getAdminOperationsSnapshot(): Promise<AdminOperationsSnapshot> {
  const q = getExecutor();
  const now = new Date();
  const windowStartedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    [playerSummary],
    realmRows,
    tutorialRows,
    [mailSummary],
    [dungeonSummary],
    [sectTaskSummary],
    [economySummary],
    [sectContributionSummary],
    [sectShopSummary],
    [reputationShopSummary],
    [deliverySummary],
    materialRows,
  ] = await runDbTasks(q, [
    () =>
      q
        .select({
          total: count(),
          active24h: sql<number>`count(*) filter (where ${cultivators.lastActiveAt} >= ${windowStartedAt})::int`,
          active7d: sql<number>`count(*) filter (where ${cultivators.lastActiveAt} >= ${sevenDaysAgo})::int`,
        })
        .from(cultivators)
        .where(eq(cultivators.status, 'active')),
    () =>
      q
        .select({
          realm: cultivators.realm,
          stage: cultivators.realm_stage,
          count: count(),
        })
        .from(cultivators)
        .where(eq(cultivators.status, 'active'))
        .groupBy(cultivators.realm, cultivators.realm_stage),
    () =>
      q
        .select({
          definitionId: cultivatorTasks.definitionId,
          assigned: count(),
          completed: sql<number>`count(*) filter (where ${cultivatorTasks.status} = 'completed')::int`,
          rewardSent: sql<number>`count(*) filter (where (${cultivatorTasks.metadata} ->> 'rewardClaimedAt') is not null)::int`,
        })
        .from(cultivatorTasks)
        .where(inArray(cultivatorTasks.definitionId, TUTORIAL_IDS))
        .groupBy(cultivatorTasks.definitionId),
    () =>
      q
        .select({
          unread: sql<number>`count(*) filter (where ${mails.isRead} = false)::int`,
          unclaimedRewards: sql<number>`count(*) filter (
            where ${mails.type} = 'reward'
              and ${mails.isClaimed} = false
              and ${mails.attachments} is not null
              and ${mails.attachments} <> '[]'::jsonb
          )::int`,
        })
        .from(mails),
    () =>
      q
        .select({
          runs: count(),
          players: sql<number>`count(distinct ${dungeonHistories.cultivatorId})::int`,
        })
        .from(dungeonHistories)
        .where(gte(dungeonHistories.createdAt, windowStartedAt)),
    () =>
      q
        .select({ completed: count() })
        .from(sectTaskRecords)
        .where(
          and(
            eq(sectTaskRecords.status, 'completed'),
            gte(sectTaskRecords.completedAt, windowStartedAt),
          ),
        ),
    () =>
      q
        .select({
          spiritStones: sql<number>`coalesce(sum(${cultivators.spirit_stones}), 0)::bigint`,
          reputation: sql<number>`coalesce(sum(${cultivators.reputation}), 0)::bigint`,
        })
        .from(cultivators)
        .where(eq(cultivators.status, 'active')),
    () =>
      q
        .select({
          contribution: sql<number>`coalesce(sum(${sectMemberships.contribution}), 0)::bigint`,
        })
        .from(sectMemberships)
        .where(eq(sectMemberships.status, 'active')),
    () =>
      q
        .select({ purchases: count() })
        .from(sectShopPurchases)
        .where(gte(sectShopPurchases.createdAt, windowStartedAt)),
    () =>
      q
        .select({ purchases: count() })
        .from(reputationShopPurchases)
        .where(gte(reputationShopPurchases.createdAt, windowStartedAt)),
    () =>
      q
        .select({ pending: count() })
        .from(transactionalMessages)
        .where(isNull(transactionalMessages.publishedAt)),
    () =>
      q
        .select({
          materialType: itemLibrary.category,
          quality: itemLibrary.quality,
          count: count(),
        })
        .from(itemLibrary)
        .where(
          and(
            eq(itemLibrary.type, 'material'),
            eq(itemLibrary.status, 'published'),
            inArray(itemLibrary.category, MATERIAL_TYPE_VALUES),
            inArray(itemLibrary.quality, QUALITY_VALUES),
          ),
        )
        .groupBy(itemLibrary.category, itemLibrary.quality),
  ]);

  const tutorialsById = new Map(
    tutorialRows.map((row) => [row.definitionId, row]),
  );
  const tutorials: AdminOperationsTutorialRow[] = TUTORIAL_IDS.map(
    (definitionId) => {
      const row = tutorialsById.get(definitionId);
      return {
        definitionId,
        title: TUTORIAL_TITLES[definitionId],
        assigned: toNumber(row?.assigned),
        completed: toNumber(row?.completed),
        rewardSent: toNumber(row?.rewardSent),
      };
    },
  );

  const coverage = new Map(
    materialRows.map((row) => [
      `${row.materialType}:${row.quality}`,
      toNumber(row.count),
    ]),
  );
  const cells = MATERIAL_TYPE_VALUES.flatMap((materialType) =>
    QUALITY_VALUES.map((quality) => {
      const current = coverage.get(`${materialType}:${quality}`) ?? 0;
      const target =
        DAILY_MATERIAL_LIBRARY_TARGETS[materialType as MaterialType][
          quality as Quality
        ];
      return {
        materialType: materialType as MaterialType,
        quality: quality as Quality,
        current,
        target,
        deficit: Math.max(0, target - current),
      };
    }),
  );

  return {
    generatedAt: now.toISOString(),
    windowStartedAt: windowStartedAt.toISOString(),
    security: {
      turnstileEnabled: isTurnstileServerEnabled(),
    },
    players: {
      total: toNumber(playerSummary?.total),
      active24h: toNumber(playerSummary?.active24h),
      active7d: toNumber(playerSummary?.active7d),
      realms: realmRows.map((row) => ({
        realm: row.realm,
        stage: row.stage,
        count: toNumber(row.count),
      })),
    },
    tutorials,
    mail: {
      unread: toNumber(mailSummary?.unread),
      unclaimedRewards: toNumber(mailSummary?.unclaimedRewards),
    },
    gameplay24h: {
      dungeonRuns: toNumber(dungeonSummary?.runs),
      dungeonPlayers: toNumber(dungeonSummary?.players),
      sectTasksCompleted: toNumber(sectTaskSummary?.completed),
    },
    economy: {
      totalSpiritStones: toNumber(economySummary?.spiritStones),
      totalReputation: toNumber(economySummary?.reputation),
      totalSectContribution: toNumber(
        sectContributionSummary?.contribution,
      ),
      sectShopPurchases24h: toNumber(sectShopSummary?.purchases),
      reputationShopPurchases24h: toNumber(
        reputationShopSummary?.purchases,
      ),
    },
    delivery: {
      pendingTransactionMessages: toNumber(deliverySummary?.pending),
    },
    materials: {
      published: materialRows.reduce(
        (sum, row) => sum + toNumber(row.count),
        0,
      ),
      deficientCells: cells.filter((cell) => cell.deficit > 0).length,
      totalDeficit: cells.reduce((sum, cell) => sum + cell.deficit, 0),
      cells,
    },
  };
}
