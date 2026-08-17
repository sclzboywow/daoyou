import { db, type DbTransaction } from '@server/lib/drizzle/db';
import {
  herbGardenInteractions,
  herbGardenPlots,
  materials,
} from '@server/lib/drizzle/schema';
import {
  canCultivateSeedQuality,
  getHerbGardenMaxSeedQuality,
  readSpiritSeedDetails,
  readSpiritSeedSpec,
  resolveOutcomeKind,
  resolveOutcomeQuality,
  resolveOutcomeQuantity,
  resolveSpiritFruitEffects,
  type HerbGardenHarvestResult,
  type SpiritSeedDetails,
  type SpiritSeedSpec,
} from '@shared/contracts/herbGarden';
import type { ElementType, Quality, RealmType } from '@shared/types/constants';
import type { SpiritFruitSpec } from '@shared/types/consumable';
import { and, eq, gt, sql } from 'drizzle-orm';
import { HerbGardenError, getHerbGardenState } from './HerbGardenService';

const QUALITY_ORDER: readonly Quality[] = [
  '凡品',
  '灵品',
  '玄品',
  '真品',
  '地品',
  '天品',
  '仙品',
  '神品',
];
const SIMPLE_BASE_GROWTH_MINUTES = 180;
const SIMPLE_BASE_SCORE = 36;

type SeedSnapshot = {
  name: string;
  description?: string;
  rank: Quality;
  element?: ElementType;
  details: SpiritSeedDetails;
};

type OutcomeSnapshot = {
  name: string;
  description: string;
  kind: HerbGardenHarvestResult['kind'];
  rank: Quality;
  quantity: number;
  formationMethodId: 'natural_form';
  cultivation: {
    sourceSeedName: string;
    manifestationTags: string[];
  };
  spiritFruitSpec?: SpiritFruitSpec;
};

function simpleGrowthDurationMs(rank: Quality): number {
  const qualityIndex = Math.max(0, QUALITY_ORDER.indexOf(rank));
  const rankScale = 1 + qualityIndex * 0.2;
  return Math.round(SIMPLE_BASE_GROWTH_MINUTES * rankScale) * 60_000;
}

async function consumeSeed(
  tx: DbTransaction,
  cultivatorId: string,
  materialId: string,
): Promise<SeedSnapshot> {
  const [seed] = await tx
    .select({
      id: materials.id,
      name: materials.name,
      rank: materials.rank,
      element: materials.element,
      description: materials.description,
      details: materials.details,
      quantity: materials.quantity,
    })
    .from(materials)
    .where(
      and(
        eq(materials.id, materialId),
        eq(materials.cultivatorId, cultivatorId),
        eq(materials.type, 'seed'),
        gt(materials.quantity, 0),
      ),
    )
    .limit(1)
    .for('update');
  if (!seed) throw new HerbGardenError('这枚灵种已经不在储物袋中', 409);

  const details = readSpiritSeedDetails(seed.details);
  if (!details || !readSpiritSeedSpec(seed.details))
    throw new HerbGardenError('这枚灵种缺少完整种性，无法播种', 400);

  const [updated] = await tx
    .update(materials)
    .set({ quantity: sql`${materials.quantity} - 1` })
    .where(and(eq(materials.id, seed.id), gt(materials.quantity, 0)))
    .returning({ quantity: materials.quantity });
  if (!updated) throw new HerbGardenError('灵种数量已经变化，请重试', 409);
  if (updated.quantity <= 0)
    await tx.delete(materials).where(eq(materials.id, seed.id));

  return {
    name: seed.name,
    description: seed.description ?? undefined,
    rank: seed.rank as Quality,
    element: (seed.element ?? undefined) as ElementType | undefined,
    details,
  };
}

function createSimpleOutcome(
  seed: SeedSnapshot,
  spec: SpiritSeedSpec,
): OutcomeSnapshot {
  const kind = resolveOutcomeKind(
    spec,
    'natural_form',
    SIMPLE_BASE_SCORE,
    Math.random(),
    seed.rank,
  );
  const rank = resolveOutcomeQuality(
    seed.rank,
    SIMPLE_BASE_SCORE,
    Math.random(),
  );
  const quantity = resolveOutcomeQuantity(
    kind,
    'natural_form',
    SIMPLE_BASE_SCORE,
    Math.random(),
  );
  const base =
    seed.name.replace(/[灵道玄异]?种$|灵籽$|玄籽$|灵核$|籽$/, '') || '无名';
  const name =
    kind === 'spirit_fruit'
      ? `${base}凝露果`
      : kind === 'tcdb'
        ? `${base}草木精粹`
        : `${base}灵药`;
  const description =
    kind === 'spirit_fruit'
      ? '灵田中自然生长后凝成的灵果，果肉仍留有原种草木灵机。'
      : kind === 'tcdb'
        ? '灵植在成熟时返源凝成的草木灵珍。'
        : '灵田中顺时长成的成熟灵药，药性已经稳定。';
  const outcome: OutcomeSnapshot = {
    name,
    description,
    kind,
    rank,
    quantity,
    formationMethodId: 'natural_form',
    cultivation: {
      sourceSeedName: seed.name,
      manifestationTags: ['自然启灵', '顺时生长', '自然凝华'],
    },
  };
  if (kind === 'spirit_fruit') {
    const settled = resolveSpiritFruitEffects(rank, seed.element);
    outcome.spiritFruitSpec = {
      kind: 'spirit_fruit',
      family: settled.family,
      operations: settled.operations,
      consumeRules: {
        scene: 'out_of_battle_only',
        quotaCategory:
          settled.family === 'cultivation' ? 'cultivation' : 'none',
      },
      cultivationMeta: {
        source: 'herb_garden',
        element: seed.element,
        tags: ['灵田'],
        sourceSeedName: seed.name,
        manifestationTags: outcome.cultivation.manifestationTags,
      },
    };
  }
  return outcome;
}

export async function sowHerbSimply(
  cultivatorId: string,
  input: { slot: number; seedMaterialId: string },
): Promise<void> {
  const current = await getHerbGardenState(cultivatorId);
  if (!Number.isInteger(input.slot) || input.slot < 1 || input.slot > 6)
    throw new HerbGardenError('灵畦编号无效', 400);

  const realm = current.progression.realm as RealmType;
  await db.transaction(async (tx) => {
    const [occupied] = await tx
      .select({ id: herbGardenPlots.id })
      .from(herbGardenPlots)
      .where(
        and(
          eq(herbGardenPlots.cultivatorId, cultivatorId),
          eq(herbGardenPlots.slot, input.slot),
        ),
      )
      .limit(1)
      .for('update');
    if (occupied) throw new HerbGardenError('这块灵畦已有灵植', 409);

    const seed = await consumeSeed(tx, cultivatorId, input.seedMaterialId);
    if (!canCultivateSeedQuality(realm, seed.rank)) {
      throw new HerbGardenError(
        `当前${realm}最高只能培育${getHerbGardenMaxSeedQuality(realm)}灵种`,
        403,
      );
    }
    const spec = readSpiritSeedSpec(seed.details);
    if (!spec) throw new HerbGardenError('灵种内蕴数据缺失，无法播种', 400);

    const outcome = createSimpleOutcome(seed, spec);
    const plantedAt = new Date();
    const readyAt = new Date(
      plantedAt.getTime() + simpleGrowthDurationMs(seed.rank),
    );
    const [plot] = await tx
      .insert(herbGardenPlots)
      .values({
        cultivatorId,
        slot: input.slot,
        stage: 'formation',
        seedName: seed.name,
        seedRank: seed.rank,
        seedElement: seed.element ?? null,
        seedSnapshot: seed,
        stageHistory: [],
        currentScore: SIMPLE_BASE_SCORE,
        plantedAt,
        readyAt,
        outcomeSnapshot: outcome,
      })
      .returning({ id: herbGardenPlots.id });

    await tx.insert(herbGardenInteractions).values({
      plotId: plot.id,
      ownerId: cultivatorId,
      actorId: cultivatorId,
      action: 'plant',
      plantName: seed.name,
      payload: { slot: input.slot, mode: 'simple' },
    });
  });
}
