import { EnemyGenerator } from '@shared/engine/enemyGenerator';
import {
  buildTowerEnemyVariantSeed,
  getNextTowerSeasonMeta,
  getTowerSeasonMeta,
  pickTowerRace,
  resolveTowerDifficulty,
  resolveTowerFloorKind,
  resolveTowerRealmStage,
  TOWER_ELIGIBLE_REALMS,
  TOWER_MAX_FLOOR,
  type TowerEncounter,
  type TowerPreparedEnemy,
  type TowerPreparedEnemySetStatus,
  type TowerSeasonMeta,
} from '@shared/lib/tower';
import type { RealmType } from '@shared/types/constants';
import { ServerEnemyCopyProvider } from '@server/lib/services/ServerEnemyCopyProvider';
import {
  findLatestReadyTowerEnemyFloor,
  findTowerEnemyFloor,
  listTowerEnemyFloorSummariesBySeason,
  listTowerEnemyFloorsBySeasonRealm,
  upsertFailedTowerEnemyFloor,
  upsertReadyTowerEnemyFloor,
  type TowerEnemyFloorRecord,
  type TowerEnemyFloorSummaryRecord,
} from '@server/lib/repositories/towerEnemySetRepository';

export const TOWER_ENEMY_SET_SCHEMA_VERSION = 1;

export type TowerEnemySetEnsureResult = {
  seasonKey: string;
  realm: RealmType;
  processed: number;
  generated: number;
  skipped: number;
  failed: number;
  enemyCount: number;
  logs: string[];
};

export type TowerEnemySetRefreshResult = {
  seasonKey: string;
  processed: number;
  generated: number;
  skipped: number;
  failed: number;
  logs: string[];
};

export type TowerEnemySetAdminEnemySummary = {
  floor: number;
  kind: TowerEncounter['kind'];
  difficulty: number;
  race: TowerEncounter['race'];
  realmStage: TowerEncounter['realmStage'];
  name: string;
  title: string | null;
  source: TowerPreparedEnemy['generationMeta']['source'];
  generatedAt: string;
};

export type TowerEnemySetAdminRealmSummary = {
  seasonKey: string;
  realm: RealmType;
  status: TowerPreparedEnemySetStatus | 'missing' | 'incomplete';
  schemaVersion: number | null;
  enemyCount: number;
  generatedAt: string | null;
  updatedAt: string | null;
  errorMessage: string | null;
};

export type TowerEnemySetAdminSnapshot = {
  seasonKey: string;
  realms: TowerEnemySetAdminRealmSummary[];
};

export type TowerEnemySetAdminRealmDetail = TowerEnemySetAdminRealmSummary & {
  sourceCounts: Record<TowerPreparedEnemy['generationMeta']['source'], number>;
  enemies: TowerEnemySetAdminEnemySummary[];
};

type TowerEnemySetServiceDeps = {
  generator?: EnemyGenerator;
  fallbackGenerator?: EnemyGenerator;
};

const defaultGenerator = new EnemyGenerator({
  copyProvider: new ServerEnemyCopyProvider({
    enabled: process.env.NODE_ENV !== 'test',
  }),
});
const defaultFallbackGenerator = new EnemyGenerator();

function buildTowerEncounter(args: {
  seasonKey: string;
  realm: RealmType;
  floor: number;
}): TowerEncounter {
  const kind = resolveTowerFloorKind(args.floor);
  return {
    floor: args.floor,
    kind,
    difficulty: resolveTowerDifficulty(args.floor),
    race: pickTowerRace(`${args.seasonKey}:${args.realm}`, args.floor),
    realm: args.realm,
    realmStage: resolveTowerRealmStage(args.floor),
    isBoss: kind === 'boss',
  };
}

function clonePreparedEnemy(enemy: TowerPreparedEnemy): TowerPreparedEnemy {
  return structuredClone(enemy);
}

function isLlmEnriched(draft: ReturnType<EnemyGenerator['buildDraft']>): boolean {
  return Object.values(draft.missingNarrative).every((missing) => !missing);
}

function getReadyEnemy(row: TowerEnemyFloorRecord | undefined): TowerPreparedEnemy | undefined {
  if (!row || row.status !== 'ready' || !row.enemy) {
    return undefined;
  }
  return row.enemy;
}

function latestDateIso(
  rows: TowerEnemyFloorSummaryRecord[],
  key: 'generatedAt' | 'updatedAt',
): string | null {
  const latest = rows
    .map((row) => row[key]?.getTime())
    .filter((value): value is number => Number.isFinite(value))
    .sort((left, right) => right - left)[0];
  return typeof latest === 'number' ? new Date(latest).toISOString() : null;
}

export class TowerEnemySetService {
  private readonly generator: EnemyGenerator;
  private readonly fallbackGenerator: EnemyGenerator;

  constructor(deps: TowerEnemySetServiceDeps = {}) {
    this.generator = deps.generator ?? defaultGenerator;
    this.fallbackGenerator = deps.fallbackGenerator ?? defaultFallbackGenerator;
  }

  async ensureTowerEnemySet(
    season: TowerSeasonMeta,
    realm: RealmType,
    options: { force?: boolean } = {},
  ): Promise<TowerEnemySetEnsureResult> {
    const logs: string[] = [];
    let generated = 0;
    let skipped = 0;
    let failed = 0;

    for (let floor = 1; floor <= TOWER_MAX_FLOOR; floor += 1) {
      if (!options.force) {
        const existing = getReadyEnemy(
          await findTowerEnemyFloor({
            seasonKey: season.seasonKey,
            realm,
            floor,
            status: 'ready',
          }),
        );
        if (existing) {
          skipped += 1;
          continue;
        }
      }

      try {
        const generatedAt = new Date();
        const enemy = await this.generatePreparedEnemy({
          seasonKey: season.seasonKey,
          realm,
          floor,
          generatedAt,
        });
        await upsertReadyTowerEnemyFloor({
          seasonKey: season.seasonKey,
          realm,
          floor,
          enemy,
          generatedAt,
          schemaVersion: TOWER_ENEMY_SET_SCHEMA_VERSION,
        });
        generated += 1;
      } catch (error) {
        failed += 1;
        const message =
          error instanceof Error ? error.message : 'tower enemy generation failed';
        await upsertFailedTowerEnemyFloor({
          seasonKey: season.seasonKey,
          realm,
          floor,
          errorMessage: message,
        });
        logs.push(`${realm} ${floor}: failed ${message}`);
      }
    }

    return {
      seasonKey: season.seasonKey,
      realm,
      processed: TOWER_MAX_FLOOR,
      generated,
      skipped,
      failed,
      enemyCount: generated + skipped,
      logs,
    };
  }

  async ensureTowerEnemySetsForSeason(
    season: TowerSeasonMeta,
    options: { force?: boolean } = {},
  ): Promise<TowerEnemySetRefreshResult> {
    const logs: string[] = [];
    let generated = 0;
    let skipped = 0;
    let failed = 0;
    let processed = 0;

    for (const realm of TOWER_ELIGIBLE_REALMS) {
      const result = await this.ensureTowerEnemySet(season, realm, options);
      generated += result.generated;
      skipped += result.skipped;
      failed += result.failed;
      processed += result.processed;
      logs.push(
        `${realm}: generated ${result.generated}, skipped ${result.skipped}, failed ${result.failed}`,
        ...result.logs,
      );
    }

    return {
      seasonKey: season.seasonKey,
      processed,
      generated,
      skipped,
      failed,
      logs,
    };
  }

  async refreshCurrentAndNextIfNeeded(now: Date = new Date()) {
    const current = getTowerSeasonMeta(now);
    const results = [await this.ensureTowerEnemySetsForSeason(current)];
    const nextResetAtMs = Date.parse(current.nextResetAt);
    const prewarmMs = 48 * 60 * 60 * 1000;

    if (nextResetAtMs - now.getTime() <= prewarmMs) {
      results.push(
        await this.ensureTowerEnemySetsForSeason(getNextTowerSeasonMeta(now)),
      );
    }

    return results;
  }

  async loadTowerEnemyForBattle(args: {
    seasonKey: string;
    realm: RealmType;
    floor: number;
  }): Promise<TowerPreparedEnemy> {
    const current = getReadyEnemy(
      await findTowerEnemyFloor({
        seasonKey: args.seasonKey,
        realm: args.realm,
        floor: args.floor,
        status: 'ready',
      }),
    );
    if (current) {
      return clonePreparedEnemy(current);
    }

    const latest = getReadyEnemy(
      await findLatestReadyTowerEnemyFloor({
        realm: args.realm,
        floor: args.floor,
        beforeSeasonKey: args.seasonKey,
      }),
    );
    if (latest) {
      return clonePreparedEnemy(latest);
    }

    return this.generateFallbackPreparedEnemy(args);
  }

  async getAdminSnapshot(
    seasonKey: string,
  ): Promise<TowerEnemySetAdminSnapshot> {
    const rows = await listTowerEnemyFloorSummariesBySeason({ seasonKey });
    const rowsByRealm = new Map<RealmType, TowerEnemyFloorSummaryRecord[]>();
    for (const row of rows) {
      const realm = row.realm as RealmType;
      rowsByRealm.set(realm, [...(rowsByRealm.get(realm) ?? []), row]);
    }

    return {
      seasonKey,
      realms: TOWER_ELIGIBLE_REALMS.map((realm) =>
        this.buildAdminRealmSummary(seasonKey, realm, rowsByRealm.get(realm) ?? []),
      ),
    };
  }

  async getAdminRealmDetail(args: {
    seasonKey: string;
    realm: RealmType;
  }): Promise<TowerEnemySetAdminRealmDetail> {
    const rows = await listTowerEnemyFloorsBySeasonRealm(args);
    const summary = this.buildAdminRealmSummary(
      args.seasonKey,
      args.realm,
      rows,
    );
    const readyEnemies = rows
      .flatMap((row) => (getReadyEnemy(row) ? [getReadyEnemy(row)!] : []))
      .sort((left, right) => left.floor - right.floor);
    const sourceCounts = readyEnemies.reduce(
      (counts, enemy) => {
        counts[enemy.generationMeta.source] += 1;
        return counts;
      },
      { llm: 0, fallback: 0 } as Record<
        TowerPreparedEnemy['generationMeta']['source'],
        number
      >,
    );

    return {
      ...summary,
      sourceCounts,
      enemies: readyEnemies.map((enemy) => ({
        floor: enemy.floor,
        kind: enemy.encounter.kind,
        difficulty: enemy.encounter.difficulty,
        race: enemy.encounter.race,
        realmStage: enemy.encounter.realmStage,
        name: enemy.enemy.name,
        title: enemy.enemy.title ?? null,
        source: enemy.generationMeta.source,
        generatedAt: enemy.generationMeta.generatedAt,
      })),
    };
  }

  private buildAdminRealmSummary(
    seasonKey: string,
    realm: RealmType,
    rows: TowerEnemyFloorSummaryRecord[],
  ): TowerEnemySetAdminRealmSummary {
    if (rows.length === 0) {
      return {
        seasonKey,
        realm,
        status: 'missing',
        schemaVersion: null,
        enemyCount: 0,
        generatedAt: null,
        updatedAt: null,
        errorMessage: null,
      };
    }

    const readyCount = rows.filter((row) => row.status === 'ready').length;
    const failedRows = rows.filter((row) => row.status === 'failed');
    const schemaVersion = rows.reduce<number | null>(
      (max, row) =>
        max == null ? row.schemaVersion : Math.max(max, row.schemaVersion),
      null,
    );

    return {
      seasonKey,
      realm,
      status:
        readyCount === TOWER_MAX_FLOOR
          ? 'ready'
          : failedRows.length > 0
            ? 'failed'
            : 'incomplete',
      schemaVersion,
      enemyCount: readyCount,
      generatedAt: latestDateIso(rows, 'generatedAt'),
      updatedAt: latestDateIso(rows, 'updatedAt'),
      errorMessage:
        failedRows.length > 0
          ? failedRows
              .map((row) => `${row.floor}层：${row.errorMessage ?? '生成失败'}`)
              .join('\n')
          : null,
    };
  }

  private async generatePreparedEnemy(args: {
    seasonKey: string;
    realm: RealmType;
    floor: number;
    generatedAt: Date;
  }): Promise<TowerPreparedEnemy> {
    const encounter = buildTowerEncounter(args);
    const variantSeed = buildTowerEnemyVariantSeed(args);
    const draft = await this.generator.enrichNarrative(
      this.generator.buildDraft({
        realm: encounter.realm,
        realmStage: encounter.realmStage,
        race: encounter.race,
        difficulty: encounter.difficulty,
        isBoss: encounter.isBoss,
        variantSeed,
      }),
    );

    return {
      floor: args.floor,
      encounter,
      enemy: draft.cultivator,
      generationMeta: {
        variantSeed,
        source: isLlmEnriched(draft) ? 'llm' : 'fallback',
        generatedAt: args.generatedAt.toISOString(),
      },
    };
  }

  private generateFallbackPreparedEnemy(args: {
    seasonKey: string;
    realm: RealmType;
    floor: number;
  }): TowerPreparedEnemy {
    const encounter = buildTowerEncounter(args);
    const variantSeed = buildTowerEnemyVariantSeed(args);
    const draft = this.fallbackGenerator.buildDraft({
      realm: encounter.realm,
      realmStage: encounter.realmStage,
      race: encounter.race,
      difficulty: encounter.difficulty,
      isBoss: encounter.isBoss,
      variantSeed,
    });

    return {
      floor: args.floor,
      encounter,
      enemy: draft.cultivator,
      generationMeta: {
        variantSeed,
        source: 'fallback',
        generatedAt: new Date(0).toISOString(),
      },
    };
  }
}

export const towerEnemySetService = new TowerEnemySetService();
