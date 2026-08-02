import {
  runAuctionExpireJob,
  runActivityDispatchJob,
  runBetBattleExpireJob,
  runExpiredDataCleanupJob,
  runMarketRefreshCronJob,
  runMaterialLibraryDailyGenerationJob,
  runResourceReplayCleanupJob,
  runRankRewardsJob,
  runTowerEnemySetRefreshJob,
} from './internalCron';

const AUCTION_EXPIRE_SCHEDULE = '*/2 * * * *';
const ACTIVITY_DISPATCH_SCHEDULE = '*/1 * * * *';
const BET_BATTLE_EXPIRE_SCHEDULE = '*/2 * * * *';
// Bun.cron uses UTC for cron expressions. 16:00 UTC equals 00:00 Asia/Shanghai.
const RANK_REWARDS_SCHEDULE = '0 16 * * *';
// Market refresh: every 5 minutes to pre-generate listings before 15-min cycle ends
const MARKET_REFRESH_SCHEDULE = '*/5 * * * *';
const TOWER_ENEMY_SETS_SCHEDULE = '0 * * * *';
const RESOURCE_REPLAY_CLEANUP_SCHEDULE = '30 18 * * *';
const EXPIRED_DATA_CLEANUP_SCHEDULE = '45 18 * * *';
// 17:00 UTC equals 01:00 Asia/Shanghai.
const MATERIAL_LIBRARY_DAILY_GENERATION_SCHEDULE = '0 17 * * *';

let schedulerRegistered = false;
let scheduledTasks: Bun.CronJob[] = [];

async function runScheduledJob(
  jobName: string,
  runJob: () => Promise<unknown>,
): Promise<void> {
  try {
    await runJob();
  } catch (error) {
    console.error(`[cron] scheduled ${jobName} failed`, error);
  }
}

export function registerInternalCronJobs(
  options: {
    enabled?: boolean;
  } = {},
): Bun.CronJob[] {
  const { enabled = process.env.NODE_ENV === 'production' } = options;

  if (!enabled || schedulerRegistered) {
    return scheduledTasks;
  }

  scheduledTasks = [
    Bun.cron(ACTIVITY_DISPATCH_SCHEDULE, () =>
      runScheduledJob('activity-dispatch', runActivityDispatchJob),
    ),
    Bun.cron(AUCTION_EXPIRE_SCHEDULE, () =>
      runScheduledJob('auction-expire', runAuctionExpireJob),
    ),
    Bun.cron(BET_BATTLE_EXPIRE_SCHEDULE, () =>
      runScheduledJob('bet-battle-expire', runBetBattleExpireJob),
    ),
    Bun.cron(RANK_REWARDS_SCHEDULE, () =>
      runScheduledJob('rank-rewards', runRankRewardsJob),
    ),
    Bun.cron(MARKET_REFRESH_SCHEDULE, () =>
      runScheduledJob('market-refresh', runMarketRefreshCronJob),
    ),
    Bun.cron(TOWER_ENEMY_SETS_SCHEDULE, () =>
      runScheduledJob('tower-enemy-sets', runTowerEnemySetRefreshJob),
    ),
    Bun.cron(RESOURCE_REPLAY_CLEANUP_SCHEDULE, () =>
      runScheduledJob(
        'resource-replay-cleanup',
        runResourceReplayCleanupJob,
      ),
    ),
    Bun.cron(EXPIRED_DATA_CLEANUP_SCHEDULE, () =>
      runScheduledJob('expired-data-cleanup', runExpiredDataCleanupJob),
    ),
    Bun.cron(MATERIAL_LIBRARY_DAILY_GENERATION_SCHEDULE, () =>
      runScheduledJob(
        'material-library-daily-generation',
        runMaterialLibraryDailyGenerationJob,
      ),
    ),
  ];
  schedulerRegistered = true;

  console.info('[cron] registered Bun cron jobs', {
    activityDispatch: ACTIVITY_DISPATCH_SCHEDULE,
    auctionExpire: AUCTION_EXPIRE_SCHEDULE,
    betBattleExpire: BET_BATTLE_EXPIRE_SCHEDULE,
    rankRewardsUtc: RANK_REWARDS_SCHEDULE,
    rankRewardsLocal: '00:00 Asia/Shanghai',
    marketRefresh: MARKET_REFRESH_SCHEDULE,
    towerEnemySets: TOWER_ENEMY_SETS_SCHEDULE,
    resourceReplayCleanupUtc: RESOURCE_REPLAY_CLEANUP_SCHEDULE,
    expiredDataCleanupUtc: EXPIRED_DATA_CLEANUP_SCHEDULE,
    materialLibraryDailyGenerationUtc:
      MATERIAL_LIBRARY_DAILY_GENERATION_SCHEDULE,
    materialLibraryDailyGenerationLocal: '01:00 Asia/Shanghai',
  });

  return scheduledTasks;
}
