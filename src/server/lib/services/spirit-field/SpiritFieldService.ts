import { getExecutor, type DbExecutor, type DbTransaction } from '@server/lib/drizzle/db';
import { cultivators, materials } from '@server/lib/drizzle/schema';
import { playerCommandExecutor } from '@server/lib/services/CommandExecutors';
import { updateSpiritStones } from '@server/lib/services/cultivator/CultivatorStateRepository';
import { addMaterialStackToInventory } from '@server/lib/services/materialInventory';
import { qiCurrencyChange } from '@server/lib/services/QiResourceChanges';
import { QiService } from '@server/lib/services/QiService';
import type {
  SpiritFieldCareRequest,
  SpiritFieldHarvestRequest,
  SpiritFieldSowRequest,
  SpiritFieldUpgradeRequest,
} from '@shared/contracts/spiritField';
import {
  SPIRIT_FIELD_LEVELS,
  SPIRIT_FIELD_PLANT_MAP,
  SPIRIT_FIELD_PLOT_UNLOCKS,
  SPIRIT_FIELD_STARTER_SEEDS,
  buildSpiritFieldObservations,
  buildSpiritFieldSeedMaterial,
  calculateSpiritFieldGrowth,
  canPlantSpiritFieldSeed,
  chooseCareNeed,
  evaluateCareAction,
  getCareQiCost,
  getCompanionRollCount,
  getFocusedMainYield,
  getNextCareAt,
  getSpiritFieldLevelConfig,
  isSpiritFieldPlotUnlocked,
  normalizeSpiritFieldProfile,
  pickCompanionPlants,
  type SpiritFieldPlotState,
  type SpiritFieldProfileV1,
} from '@shared/engine/spirit-field';
import type { Material } from '@shared/types/cultivator';
import type { RealmType } from '@shared/types/constants';
import { and, eq } from 'drizzle-orm';
import { interpretSpiritFieldCare, narrateSpiritFieldResult } from './SpiritFieldLlmService';

export type SpiritFieldActor = { userId: string; cultivatorId: string };

type GameSettingsRecord = Record<string, unknown> & { spiritField?: unknown };

type SeedDetails = {
  spiritFieldSeed?: { version?: number; plantId?: string };
  spiritFieldCare?: { version?: number; effect?: string; power?: number };
};

export class SpiritFieldServiceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

function settingsRecord(value: unknown): GameSettingsRecord {
  return value && typeof value === 'object'
    ? ({ ...(value as Record<string, unknown>) } as GameSettingsRecord)
    : {};
}

function careItemDetails(effect: string, power: number): Record<string, unknown> {
  return { spiritFieldCare: { version: 1, effect, power } };
}

function getSeedPlantId(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const seed = (details as SeedDetails).spiritFieldSeed;
  const plantId = seed && typeof seed.plantId === 'string' ? seed.plantId : null;
  return plantId && SPIRIT_FIELD_PLANT_MAP.has(plantId) ? plantId : null;
}

function getCareItemMeta(details: unknown): SeedDetails['spiritFieldCare'] | null {
  if (!details || typeof details !== 'object') return null;
  const value = (details as SeedDetails).spiritFieldCare;
  return value && typeof value.effect === 'string' ? value : null;
}

async function loadCultivator(
  actor: SpiritFieldActor,
  q: DbExecutor | DbTransaction = getExecutor(),
) {
  const [row] = await q
    .select({
      id: cultivators.id,
      userId: cultivators.userId,
      realm: cultivators.realm,
      spiritStones: cultivators.spirit_stones,
      gameSettings: cultivators.gameSettings,
    })
    .from(cultivators)
    .where(
      and(
        eq(cultivators.id, actor.cultivatorId),
        eq(cultivators.userId, actor.userId),
        eq(cultivators.status, 'active'),
      ),
    )
    .limit(1);
  if (!row) throw new SpiritFieldServiceError('当前没有可用的活跃角色', 404);
  return row;
}

function readProfile(gameSettings: unknown): SpiritFieldProfileV1 {
  return normalizeSpiritFieldProfile(settingsRecord(gameSettings).spiritField);
}

async function writeProfile(
  tx: DbTransaction,
  cultivatorId: string,
  currentSettings: unknown,
  profile: SpiritFieldProfileV1,
) {
  await tx
    .update(cultivators)
    .set({
      gameSettings: {
        ...settingsRecord(currentSettings),
        spiritField: profile,
      },
    })
    .where(eq(cultivators.id, cultivatorId));
}

function resetPlot(index: number): SpiritFieldPlotState {
  return {
    index,
    plantId: null,
    plantedAt: null,
    careCount: 0,
    careBoostMs: 0,
    lastCareAt: null,
    careNeed: null,
  };
}

function roll(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

async function addMaterial(
  tx: DbTransaction,
  cultivatorId: string,
  material: Omit<Material, 'id'>,
) {
  await addMaterialStackToInventory(cultivatorId, material, tx);
}

export async function getSpiritFieldSnapshot(actor: SpiritFieldActor) {
  const row = await loadCultivator(actor);
  const profile = readProfile(row.gameSettings);
  const realm = row.realm as RealmType;
  const qi = await QiService.getQiState(actor.cultivatorId);
  const inventoryRows = await getExecutor()
    .select()
    .from(materials)
    .where(eq(materials.cultivatorId, actor.cultivatorId));

  const seeds = inventoryRows.flatMap((item) => {
    const plantId = getSeedPlantId(item.details);
    const plant = plantId ? SPIRIT_FIELD_PLANT_MAP.get(plantId) : null;
    return plant
      ? [
          {
            materialId: item.id,
            plantId,
            name: item.name,
            quantity: item.quantity,
            quality: item.rank,
            element: item.element,
            plantName: plant.name,
            minRealm: plant.minRealm,
            canPlant: canPlantSpiritFieldSeed(realm, plant.id),
          },
        ]
      : [];
  });

  const careItems = inventoryRows.flatMap((item) => {
    const meta = getCareItemMeta(item.details);
    return meta
      ? [
          {
            materialId: item.id,
            name: item.name,
            quantity: item.quantity,
            quality: item.rank,
            effect: meta.effect,
            power: meta.power ?? 0,
          },
        ]
      : [];
  });

  const now = Date.now();
  const plots = profile.plots.map((plot) => {
    const unlockRule = SPIRIT_FIELD_PLOT_UNLOCKS[plot.index]!;
    const unlocked = isSpiritFieldPlotUnlocked({
      plotIndex: plot.index,
      realm,
      selfHarvestCount: profile.selfHarvestCount,
    });
    const plant = plot.plantId ? SPIRIT_FIELD_PLANT_MAP.get(plot.plantId) : null;
    const growth = calculateSpiritFieldGrowth({ plot, fieldLevel: profile.level, nowMs: now });
    const nextCareAt = getNextCareAt(plot);
    return {
      ...plot,
      unlocked,
      unlockRule,
      plant: plant
        ? {
            id: plant.id,
            name: plant.name,
            quality: plant.quality,
            element: plant.element,
            description: plant.description,
            careSlots: plant.careSlots,
            careCooldownMs: plant.careCooldownMs,
          }
        : null,
      progress: growth.progress,
      mature: growth.mature,
      remainingMs: growth.remainingMs,
      nextCareAt,
      canCare:
        Boolean(plant) &&
        !growth.mature &&
        plot.careCount < (plant?.careSlots ?? 0) &&
        (!nextCareAt || nextCareAt <= now),
      observations: plant ? buildSpiritFieldObservations(plot.careNeed) : [],
    };
  });

  const level = getSpiritFieldLevelConfig(profile.level);
  const nextLevel = profile.level < SPIRIT_FIELD_LEVELS.length - 1
    ? SPIRIT_FIELD_LEVELS[profile.level + 1]
    : null;

  return {
    profile: {
      level: profile.level,
      levelName: level.name,
      speedBonus: level.speedBonus,
      selfHarvestCount: profile.selfHarvestCount,
      totalCareCount: profile.totalCareCount,
      starterClaimed: profile.starterClaimed,
    },
    player: {
      realm,
      spiritStones: row.spiritStones,
      qi: qi.current,
      qiMax: qi.max,
    },
    upgrade: nextLevel
      ? { nextLevel: profile.level + 1, name: nextLevel.name, cost: nextLevel.upgradeCost }
      : null,
    plots,
    seeds,
    careItems,
  };
}

export async function claimSpiritFieldStarterSeeds(actor: SpiritFieldActor) {
  return playerCommandExecutor.executeWithLock({
    userId: actor.userId,
    cultivatorId: actor.cultivatorId,
    source: 'spirit_field_starter',
    command: async (tx) => {
      const row = await loadCultivator(actor, tx);
      const profile = readProfile(row.gameSettings);
      if (profile.starterClaimed) {
        throw new SpiritFieldServiceError('初始灵种已经领取过了', 409);
      }
      for (const starter of SPIRIT_FIELD_STARTER_SEEDS) {
        const material = buildSpiritFieldSeedMaterial(starter.plantId);
        if (!material) continue;
        await addMaterial(tx, actor.cultivatorId, {
          ...material,
          quantity: starter.quantity,
        });
      }
      profile.starterClaimed = true;
      await writeProfile(tx, actor.cultivatorId, row.gameSettings, profile);
      return {
        result: { message: '已领取初始灵种' },
        resourceChanges: [
          {
            resourceTopic: 'inventory.materials',
            eventType: 'inventory.spirit-field.starter',
            operation: 'invalidate',
          },
        ],
      };
    },
  });
}

export async function sowSpiritField(actor: SpiritFieldActor, input: SpiritFieldSowRequest) {
  return playerCommandExecutor.executeWithLock({
    userId: actor.userId,
    cultivatorId: actor.cultivatorId,
    source: 'spirit_field_sow',
    command: async (tx) => {
      const row = await loadCultivator(actor, tx);
      const profile = readProfile(row.gameSettings);
      const plot = profile.plots[input.plotIndex];
      if (!plot) throw new SpiritFieldServiceError('田块不存在', 404);
      if (!isSpiritFieldPlotUnlocked({
        plotIndex: input.plotIndex,
        realm: row.realm as RealmType,
        selfHarvestCount: profile.selfHarvestCount,
      })) {
        throw new SpiritFieldServiceError('这块灵田尚未解锁', 409);
      }
      if (plot.plantId) throw new SpiritFieldServiceError('这块灵田已经种有灵植', 409);

      const [seed] = await tx
        .select()
        .from(materials)
        .where(
          and(
            eq(materials.id, input.seedMaterialId),
            eq(materials.cultivatorId, actor.cultivatorId),
          ),
        )
        .limit(1);
      if (!seed) throw new SpiritFieldServiceError('没有找到这枚灵种', 404);
      const plantId = getSeedPlantId(seed.details);
      if (!plantId) throw new SpiritFieldServiceError('该物品不是可播种的灵种');
      if (!canPlantSpiritFieldSeed(row.realm as RealmType, plantId)) {
        throw new SpiritFieldServiceError('当前境界还不足以驾驭这枚灵种', 409);
      }
      const plant = SPIRIT_FIELD_PLANT_MAP.get(plantId)!;
      if (seed.quantity <= 1) {
        await tx.delete(materials).where(eq(materials.id, seed.id));
      } else {
        await tx
          .update(materials)
          .set({ quantity: seed.quantity - 1 })
          .where(eq(materials.id, seed.id));
      }

      const plantedAt = new Date().toISOString();
      profile.plots[input.plotIndex] = {
        index: input.plotIndex,
        plantId,
        plantedAt,
        careCount: 0,
        careBoostMs: 0,
        lastCareAt: null,
        careNeed: chooseCareNeed(`${actor.cultivatorId}:${input.plotIndex}:${plantedAt}:${plantId}`),
      };
      await writeProfile(tx, actor.cultivatorId, row.gameSettings, profile);
      return {
        result: { message: `已种下${plant.name}`, plotIndex: input.plotIndex },
        resourceChanges: [
          {
            resourceTopic: 'inventory.materials',
            eventType: 'inventory.spirit-field.seed-consumed',
            operation: 'invalidate',
          },
        ],
      };
    },
  });
}

export async function interpretSpiritFieldAction(actor: SpiritFieldActor, input: {
  plotIndex: number;
  message: string;
  abortSignal?: AbortSignal;
}) {
  const row = await loadCultivator(actor);
  const profile = readProfile(row.gameSettings);
  const plot = profile.plots[input.plotIndex];
  const plant = plot?.plantId ? SPIRIT_FIELD_PLANT_MAP.get(plot.plantId) : null;
  if (!plot || !plant) throw new SpiritFieldServiceError('这块田里还没有可照料的灵植', 404);
  const growth = calculateSpiritFieldGrowth({ plot, fieldLevel: profile.level });
  if (growth.mature) throw new SpiritFieldServiceError('灵植已经成熟，可以直接采收', 409);
  return interpretSpiritFieldCare({
    message: input.message,
    plant,
    observations: buildSpiritFieldObservations(plot.careNeed),
    careCount: plot.careCount,
    careSlots: plant.careSlots,
    abortSignal: input.abortSignal,
  });
}

export async function careSpiritField(actor: SpiritFieldActor, input: SpiritFieldCareRequest) {
  if (input.plan.action === 'observe' || input.plan.action === 'wait') {
    throw new SpiritFieldServiceError('这次做法不会改变灵田状态，无需确认施为');
  }
  const fingerprint = JSON.stringify({ plotIndex: input.plotIndex, plan: input.plan });
  const committed = await playerCommandExecutor.executeWithLock({
    userId: actor.userId,
    cultivatorId: actor.cultivatorId,
    source: 'spirit_field_care',
    requestId: input.requestId,
    idempotency: { key: input.requestId, fingerprint },
    command: async (tx) => {
      const row = await loadCultivator(actor, tx);
      const profile = readProfile(row.gameSettings);
      const plot = profile.plots[input.plotIndex];
      const plant = plot?.plantId ? SPIRIT_FIELD_PLANT_MAP.get(plot.plantId) : null;
      if (!plot || !plant) throw new SpiritFieldServiceError('这块田里没有可照料的灵植', 404);
      const growth = calculateSpiritFieldGrowth({ plot, fieldLevel: profile.level });
      if (growth.mature) throw new SpiritFieldServiceError('灵植已经成熟，无需继续养护', 409);
      if (plot.careCount >= plant.careSlots) {
        throw new SpiritFieldServiceError('这株灵植本轮已经养护充分', 409);
      }
      const nextCareAt = getNextCareAt(plot);
      if (nextCareAt && nextCareAt > Date.now()) {
        throw new SpiritFieldServiceError('灵植刚刚受过养护，需要先缓一缓', 409);
      }

      const action = input.plan.action;
      const qiCost = getCareQiCost(action);
      const evaluation = evaluateCareAction(plot.careNeed, action);
      const boostMs = Math.round(plant.baseGrowthMs * evaluation.boostPercent);
      const actionInstanceId = `spirit-field-care:${actor.cultivatorId}:${input.requestId}`;
      const reservation = await QiService.reserveQi({
        cultivatorId: actor.cultivatorId,
        action: 'spirit_field_care',
        actionInstanceId,
        cost: qiCost,
        metadata: { plantId: plant.id, plotIndex: input.plotIndex, action },
        tx,
      });
      await QiService.commitReservation({ actionInstanceId, tx });

      const caredAt = new Date().toISOString();
      const nextCareCount = plot.careCount + 1;
      profile.plots[input.plotIndex] = {
        ...plot,
        careCount: nextCareCount,
        careBoostMs: plot.careBoostMs + boostMs,
        lastCareAt: caredAt,
        careNeed:
          nextCareCount >= plant.careSlots
            ? null
            : chooseCareNeed(`${plot.plantedAt}:${nextCareCount}:${action}`),
      };
      profile.totalCareCount += 1;
      await writeProfile(tx, actor.cultivatorId, row.gameSettings, profile);

      return {
        result: {
          plantName: plant.name,
          grade: evaluation.grade,
          growthBoostPercent: Math.round(evaluation.boostPercent * 100),
          qiCost,
          qiAfter: reservation.qiAfter,
          careCount: nextCareCount,
          careSlots: plant.careSlots,
          narrative: '',
        },
        resourceChanges: [
          qiCurrencyChange('currency.spirit-field.care', reservation),
        ],
      };
    },
  });

  committed.result.narrative = await narrateSpiritFieldResult({
    kind: 'care',
    plantName: committed.result.plantName,
    facts: {
      grade: committed.result.grade,
      growthBoostPercent: committed.result.growthBoostPercent,
      qiCost: committed.result.qiCost,
      plan: input.plan.summary,
    },
    fallback: `你按既定手法细细照料${committed.result.plantName}，灵植气息随之平稳了几分。`,
  });
  return committed;
}

export async function harvestSpiritField(actor: SpiritFieldActor, input: SpiritFieldHarvestRequest) {
  const committed = await playerCommandExecutor.executeWithLock({
    userId: actor.userId,
    cultivatorId: actor.cultivatorId,
    source: 'spirit_field_harvest',
    requestId: input.requestId,
    idempotency: {
      key: input.requestId,
      fingerprint: JSON.stringify({ plotIndex: input.plotIndex, mode: input.mode }),
    },
    command: async (tx) => {
      const row = await loadCultivator(actor, tx);
      const profile = readProfile(row.gameSettings);
      const plot = profile.plots[input.plotIndex];
      const plant = plot?.plantId ? SPIRIT_FIELD_PLANT_MAP.get(plot.plantId) : null;
      if (!plot || !plant) throw new SpiritFieldServiceError('这块田里没有可采收的灵植', 404);
      const growth = calculateSpiritFieldGrowth({ plot, fieldLevel: profile.level });
      if (!growth.mature) throw new SpiritFieldServiceError('灵植尚未成熟', 409);

      const rewards: Array<{ name: string; quantity: number; kind: 'herb' | 'seed' | 'care' }> = [];
      const mainQuantity = input.mode === 'focused' ? getFocusedMainYield(profile.level) : 1;
      await addMaterial(tx, actor.cultivatorId, {
        name: plant.name,
        type: 'herb',
        rank: plant.quality,
        element: plant.element,
        description: plant.description,
        details: { spiritField: { source: 'harvest', plantId: plant.id } },
        quantity: mainQuantity,
      });
      rewards.push({ name: plant.name, quantity: mainQuantity, kind: 'herb' });

      let harvestedHerbs = mainQuantity;
      if (input.mode === 'broad') {
        const companionPlants = pickCompanionPlants(
          plant.id,
          getCompanionRollCount(profile.level),
          `${plot.plantedAt}:${actor.cultivatorId}:companions`,
        );
        const grouped = new Map<string, { plant: (typeof companionPlants)[number]; quantity: number }>();
        for (const companion of companionPlants) {
          const current = grouped.get(companion.id);
          grouped.set(companion.id, {
            plant: companion,
            quantity: (current?.quantity ?? 0) + 1,
          });
        }
        for (const { plant: companion, quantity } of grouped.values()) {
          await addMaterial(tx, actor.cultivatorId, {
            name: companion.name,
            type: 'herb',
            rank: companion.quality,
            element: companion.element,
            description: companion.description,
            details: { spiritField: { source: 'companion', plantId: companion.id } },
            quantity,
          });
          harvestedHerbs += quantity;
          rewards.push({ name: companion.name, quantity, kind: 'herb' });
        }
      }

      const careRatio = plant.careSlots > 0 ? plot.careCount / plant.careSlots : 0;
      const seedReturnChance = 0.25 + Math.min(0.25, careRatio * 0.25);
      if (roll(`${plot.plantedAt}:${plot.careCount}:seed`) < seedReturnChance) {
        const seedMaterial = buildSpiritFieldSeedMaterial(plant.id);
        if (seedMaterial) {
          await addMaterial(tx, actor.cultivatorId, {
            ...seedMaterial,
            quantity: 1,
          });
          rewards.push({ name: seedMaterial.name, quantity: 1, kind: 'seed' });
        }
      }

      const dewChance = 0.08 + Math.min(0.22, careRatio * 0.22);
      if (roll(`${plot.plantedAt}:${plot.careCount}:dew`) < dewChance) {
        await addMaterial(tx, actor.cultivatorId, {
          name: '清灵露',
          type: 'aux',
          rank: '灵品',
          element: '水',
          description: '灵植成熟时偶尔凝出的清润灵露，可用于后续灵田养护内容。',
          details: careItemDetails('gentle_nurture', 1),
          quantity: 1,
        });
        rewards.push({ name: '清灵露', quantity: 1, kind: 'care' });
      }

      profile.selfHarvestCount += harvestedHerbs;
      profile.plots[input.plotIndex] = resetPlot(input.plotIndex);
      await writeProfile(tx, actor.cultivatorId, row.gameSettings, profile);
      return {
        result: {
          plantName: plant.name,
          mode: input.mode,
          rewards,
          harvestedHerbs,
          selfHarvestCount: profile.selfHarvestCount,
          narrative: '',
        },
        resourceChanges: [
          {
            resourceTopic: 'inventory.materials',
            eventType: 'inventory.spirit-field.harvest',
            operation: 'invalidate',
          },
        ],
      };
    },
  });

  committed.result.narrative = await narrateSpiritFieldResult({
    kind: 'harvest',
    plantName: committed.result.plantName,
    facts: {
      mode: committed.result.mode,
      rewards: committed.result.rewards,
      selfHarvestCount: committed.result.selfHarvestCount,
    },
    fallback: `你顺着药根细细收拢灵土，将成熟的${committed.result.plantName}稳稳采入储物袋。`,
  });
  return committed;
}

export async function upgradeSpiritField(actor: SpiritFieldActor, input: SpiritFieldUpgradeRequest) {
  return playerCommandExecutor.executeWithLock({
    userId: actor.userId,
    cultivatorId: actor.cultivatorId,
    source: 'spirit_field_upgrade',
    requestId: input.requestId,
    idempotency: {
      key: input.requestId,
      fingerprint: 'spirit-field-upgrade',
    },
    command: async (tx) => {
      const row = await loadCultivator(actor, tx);
      const profile = readProfile(row.gameSettings);
      if (profile.level >= SPIRIT_FIELD_LEVELS.length - 1) {
        throw new SpiritFieldServiceError('灵田已经达到当前最高等级', 409);
      }
      const nextLevel = SPIRIT_FIELD_LEVELS[profile.level + 1]!;
      const spiritStones = await updateSpiritStones(
        actor.userId,
        actor.cultivatorId,
        -nextLevel.upgradeCost,
        tx,
      );
      profile.level += 1;
      await writeProfile(tx, actor.cultivatorId, row.gameSettings, profile);
      return {
        result: {
          level: profile.level,
          levelName: nextLevel.name,
          speedBonus: nextLevel.speedBonus,
          spent: nextLevel.upgradeCost,
          spiritStones,
        },
        resourceChanges: [
          {
            resourceTopic: 'player.currency',
            eventType: 'currency.spirit-field.upgrade',
            operation: 'merge',
            payload: { spiritStones },
          },
        ],
      };
    },
  });
}
