import {
  getExecutor,
  type DbExecutor,
  type DbTransaction,
} from '@server/lib/drizzle/db';
import { cultivators, materials } from '@server/lib/drizzle/schema';
import { redis } from '@server/lib/redis';
import { parseRedisJson } from '@server/lib/redis/json';
import * as creationProductRepository from '@server/lib/repositories/creationProductRepository';
import { loadCultivatorSectState } from '@server/lib/repositories/sectRepository';
import {
  MAX_EQUIPPED_GONGFA,
  MAX_OWNED_CREATION_PRODUCTS_PER_TYPE,
} from '@shared/config/creationProductLimits';
import { DEFAULT_MAX_ACTIVE_SKILLS } from '@shared/config/skillLimits';
import { CreationAbilityAdapter } from '@shared/engine/creation-v2/adapters/CreationAbilityAdapter';
import { DefaultMaterialAnalyzer } from '@shared/engine/creation-v2/analysis/DefaultMaterialAnalyzer';
import { MaterialFactsBuilder } from '@shared/engine/creation-v2/analysis/MaterialFactsBuilder';
import { CREATION_INPUT_CONSTRAINTS } from '@shared/engine/creation-v2/config/CreationBalance';
import { getCreationProductTypeFromCraftType } from '@shared/engine/creation-v2/config/CreationCraftPolicy';
import {
  calculateFateAdjustedCraftCost,
  calculateHighestMaterialRank,
} from '@shared/engine/creation-v2/CraftCostCalculator';
import { CreationOrchestrator } from '@shared/engine/creation-v2/CreationOrchestrator';
import { CreationSession } from '@shared/engine/creation-v2/CreationSession';
import { CreationError } from '@shared/engine/creation-v2/errors';
import {
  deserializeCraftedOutcomeSnapshot,
  restoreCraftedOutcome,
  serializeCraftedOutcomeSnapshot,
  snapshotCraftedOutcome,
} from '@shared/engine/creation-v2/persistence/OutcomeSnapshot';
import {
  rehydrateStoredProductModel,
  toRow,
} from '@shared/engine/creation-v2/persistence/ProductPersistenceMapper';
import { MaterialRuleSet } from '@shared/engine/creation-v2/rules/material/MaterialRuleSet';
import { supportsProductType } from '@shared/engine/creation-v2/rules/recipe/ProductSupportRules';
import type {
  CraftedOutcome,
  CreationProductType,
} from '@shared/engine/creation-v2/types';
import {
  evaluateFateContext,
  getRefineSpiritStoneMultiplier,
} from '@shared/lib/fates';
import {
  getCreationProductTypeLabel,
  getGameConceptLabel,
} from '@shared/lib/gameConceptDisplay';
import type {
  ElementType,
  EquipmentSlot,
  Quality,
  RealmStage,
  RealmType,
} from '@shared/types/constants';
import type { Material, PreHeavenFate } from '@shared/types/cultivator';
import type { ResourceOperationSettlement } from '@shared/engine/resource/types';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  getCultivatorPreHeavenFates,
} from '@server/lib/services/cultivator/CultivatorProfileRepository';
import { getMysteryMaterialBlockingReason } from './materialMysteryGuard';
import { sectOrganizationFacade } from './sect-organization';
import {
  mapMaterialRow,
} from './cultivator/CultivatorInventoryRepository';
import { toArtifactFromProduct } from './creationProductArtifactSupport';

type CreationPreparationOptions = {
  /** 每个材料本次炼制实际消耗数量，未传则默认 1。会被夹紧到 [1, maxQuantityPerMaterial]。 */
  materialQuantities?: Record<string, number>;
  /** 玩家自由书写的命名/风格提示，仅影响 LLM 命名文案，不改变数值。 */
  userPrompt?: string;
  /** 仅法宝有效：玩家指定的装备槽位。其它产物传入会被忽略。 */
  requestedSlot?: EquipmentSlot;
  /** 仅神通有效：玩家指定的目标策略（单体/AOE/队友等）。其它产物传入会被忽略。 */
  requestedTargetPolicy?: {
    team: 'enemy' | 'ally' | 'self' | 'any';
    scope: 'single' | 'aoe' | 'random';
    maxTargets?: number;
  };
};

export class CreationServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'CreationServiceError';
  }
}

export interface CreationV2Result {
  id: string;
  productType: CreationProductType;
  name: string;
  description: string | null;
  element: string | null;
  quality: string | null;
  slot: string | null;
  score: number;
  productModel: Record<string, unknown>;
  /** 词缀摘要（来自 product_model.affixes），供前端结果页展示 */
  affixes: Array<{
    id: string;
    name: string;
    slot: string;
    rarity: string;
    isPerfect: boolean;
    rollEfficiency: number;
  }>;
  needs_replace?: boolean;
  currentCount?: number;
  maxCount?: number;
}

type PendingCreationPayload = {
  snapshot: string;
  previewName?: string;
  previewQuality?: string | null;
  previewElement?: string | null;
};

type LoadedPendingCreation = {
  payload: PendingCreationPayload;
};

const PENDING_CREATION_TTL_SECONDS = 3600;

export interface PreparedCreationV2 {
  commit(tx: DbTransaction): Promise<{
    result: CreationV2Result;
    inventoryChanges: ResourceOperationSettlement['inventoryChanges'];
    afterCommit?: () => Promise<void>;
  }>;
}

export interface PendingCreationItem {
  snapshot: string;
  name: string;
  description: string | null;
  productType: CreationProductType;
  element: string | null;
  quality: string | null;
  slot: string | null;
  score: number;
  productModel: Record<string, unknown>;
}

export interface CreationPreviewValidation {
  valid: boolean;
  blockingReason?: string;
  warnings: string[];
  missingMatchingManual: boolean;
}

type MaterialRow = typeof materials.$inferSelect;

const orchestrator = new CreationOrchestrator();
const materialAnalyzer = new DefaultMaterialAnalyzer();
const materialFactsBuilder = new MaterialFactsBuilder();
const materialRuleSet = new MaterialRuleSet();

class PreviewValidationOrchestrator extends CreationOrchestrator {
  public analyzeMaterialsWithDefaults(session: CreationSession) {
    return super.analyzeMaterialsWithDefaults(session);
  }

  public resolveIntentWithDefaults(session: CreationSession) {
    return super.resolveIntentWithDefaults(session);
  }

  public validateRecipeWithDefaults(session: CreationSession) {
    return super.validateRecipeWithDefaults(session);
  }

  public budgetEnergyWithDefaults(session: CreationSession) {
    return super.budgetEnergyWithDefaults(session);
  }

  public buildAffixPoolWithDefaults(session: CreationSession) {
    return super.buildAffixPoolWithDefaults(session);
  }

  public rollAffixesWithDefaults(session: CreationSession) {
    return super.rollAffixesWithDefaults(session);
  }
}

const previewValidationOrchestrator = new PreviewValidationOrchestrator();

const MISSING_MATCHING_MANUAL_WARNING_CODES = new Set([
  'skill-missing-manual',
  'gongfa-missing-manual',
]);

function buildCreationResult(
  outcome: CraftedOutcome,
  row: ReturnType<typeof toRow>,
  id: string,
): CreationV2Result {
  const productModel =
    rehydrateStoredProductModel(
      row.productModel as Record<string, unknown>,
      (row.element as ElementType | null) ?? undefined,
    ) ?? (row.productModel as Record<string, unknown>);

  return {
    id,
    productType: row.productType as CreationProductType,
    name: row.name,
    description: row.description ?? null,
    element: row.element ?? null,
    quality: row.quality ?? null,
    slot: row.slot ?? null,
    score: row.score ?? 0,
    productModel: productModel as unknown as Record<string, unknown>,
    affixes: extractAffixSummary(outcome.blueprint.productModel.affixes),
  };
}

function buildPendingCreationItem(
  outcome: CraftedOutcome,
  row: ReturnType<typeof toRow>,
  snapshot: string,
): PendingCreationItem {
  const productModel =
    rehydrateStoredProductModel(
      row.productModel as Record<string, unknown>,
      (row.element as ElementType | null) ?? undefined,
    ) ?? (row.productModel as Record<string, unknown>);

  return {
    snapshot,
    name: row.name,
    description: row.description ?? null,
    productType: row.productType as CreationProductType,
    element: row.element ?? null,
    quality: row.quality ?? null,
    slot: row.slot ?? null,
    score: row.score ?? 0,
    productModel: productModel as unknown as Record<string, unknown>,
  };
}

function getPendingCreationKey(
  cultivatorId: string,
  craftType: string,
): string {
  return `creation_pending_v2:${cultivatorId}:${craftType}`;
}

function parsePendingCreationPayload(value: unknown): PendingCreationPayload {
  const payload = value as Partial<PendingCreationPayload> | null;
  if (!payload || typeof payload.snapshot !== 'string' || !payload.snapshot) {
    throw new CreationServiceError('待确认造物的临时状态无效', 500);
  }
  return payload as PendingCreationPayload;
}

async function cachePendingCreation(
  cultivatorId: string,
  craftType: string,
  payload: PendingCreationPayload | null,
): Promise<void> {
  const pendingKey = getPendingCreationKey(cultivatorId, craftType);
  if (!payload) {
    await redis.del(pendingKey);
    return;
  }
  await redis.set(
    pendingKey,
    JSON.stringify(payload),
    'EX',
    PENDING_CREATION_TTL_SECONDS,
  );
}

async function loadPendingCreation(
  cultivatorId: string,
  craftType: string,
): Promise<LoadedPendingCreation | null> {
  const pendingKey = getPendingCreationKey(cultivatorId, craftType);
  const pendingPayload = parseRedisJson<PendingCreationPayload>(
    await redis.get(pendingKey),
    pendingKey,
  );
  if (!pendingPayload) return null;
  return { payload: parsePendingCreationPayload(pendingPayload) };
}

function toCreationMaterial(
  material: MaterialRow,
  quantityOverride?: number,
): Material {
  return {
    id: material.id,
    name: material.name,
    type: material.type as Material['type'],
    rank: material.rank as Quality,
    element: (material.element ?? undefined) as Material['element'],
    description: material.description ?? undefined,
    details: (material.details ?? undefined) as Material['details'],
    quantity: quantityOverride ?? Math.max(1, material.quantity ?? 1),
  };
}

function toCreationMaterials(
  selectedMaterials: MaterialRow[],
  quantityOverrides?: Map<string, number>,
): Material[] {
  return selectedMaterials.map((material) =>
    toCreationMaterial(material, quantityOverrides?.get(material.id)),
  );
}

async function loadOwnedMaterials(
  cultivatorId: string,
  materialIds: string[],
  options: { rejectMystery?: boolean } = {},
  q: DbExecutor | DbTransaction = getExecutor(),
): Promise<MaterialRow[]> {
  const selectedMaterials = await q
    .select()
    .from(materials)
    .where(inArray(materials.id, materialIds));

  if (selectedMaterials.length !== materialIds.length) {
    throw new CreationServiceError('部分材料已耗尽或不存在');
  }

  for (const material of selectedMaterials) {
    if (material.cultivatorId !== cultivatorId) {
      throw new CreationServiceError('非本人材料，不可动用', 403);
    }
  }
  if (options.rejectMystery ?? true) {
    const mysteryReason = getMysteryMaterialBlockingReason(selectedMaterials);
    if (mysteryReason) {
      throw new CreationServiceError(mysteryReason, 400);
    }
  }

  return selectedMaterials;
}

function buildCreationPreviewValidation(
  productType: CreationProductType,
  selectedMaterials: Material[],
): CreationPreviewValidation {
  const fingerprints = materialAnalyzer.analyze(selectedMaterials);
  const materialFacts = materialFactsBuilder.build(productType, fingerprints);
  const materialDecision = materialRuleSet.evaluate(materialFacts);
  const warnings = materialDecision.warnings.map((warning) => warning.message);
  const missingMatchingManual = materialDecision.warnings.some((warning) =>
    MISSING_MATCHING_MANUAL_WARNING_CODES.has(warning.code),
  );

  if (!materialDecision.valid) {
    return {
      valid: false,
      blockingReason:
        materialDecision.notes[0] ??
        materialDecision.reasons[0]?.message ??
        '当前材料组合不合法',
      warnings,
      missingMatchingManual,
    };
  }

  if (!supportsProductType(productType, materialDecision.recipeTags)) {
    return {
      valid: false,
      blockingReason: `当前材料组合不足以支撑${getCreationProductTypeLabel(productType)}成型`,
      warnings,
      missingMatchingManual,
    };
  }

  return {
    valid: true,
    warnings,
    missingMatchingManual,
  };
}

function getEffectiveProductLimit(
  productType: CreationProductType,
): number | null {
  if (productType === 'skill') return DEFAULT_MAX_ACTIVE_SKILLS;
  if (productType === 'gongfa') return MAX_EQUIPPED_GONGFA;
  return null;
}

function isEquipManagedProductType(
  productType: CreationProductType,
): productType is 'skill' | 'gongfa' {
  return productType === 'skill' || productType === 'gongfa';
}

function resolvePreviewExecutionBlockingReason(
  productType: CreationProductType,
  selectedMaterials: MaterialRow[],
): string | undefined {
  const previewMaterials = selectedMaterials.map((material) =>
    toCreationMaterial(
      material,
      CREATION_INPUT_CONSTRAINTS.minQuantityPerMaterial,
    ),
  );
  const session = previewValidationOrchestrator.createSession({
    productType,
    materials: previewMaterials,
  });
  session.state.intentCraftMeta = {
    suppressLogs: true,
  };

  try {
    previewValidationOrchestrator.submitMaterials(session);
    previewValidationOrchestrator.analyzeMaterialsWithDefaults(session);
    previewValidationOrchestrator.resolveIntentWithDefaults(session);
    previewValidationOrchestrator.validateRecipeWithDefaults(session);

    if (session.state.failureReason) {
      return session.state.failureReason;
    }

    previewValidationOrchestrator.budgetEnergyWithDefaults(session);
    previewValidationOrchestrator.buildAffixPoolWithDefaults(session);
    previewValidationOrchestrator.rollAffixesWithDefaults(session);
    return undefined;
  } catch (error) {
    if (isPlayerFacingSelectionError(error)) {
      return error.message;
    }
    throw error;
  } finally {
    previewValidationOrchestrator.clearSession(session.id);
  }
}

function isPlayerFacingSelectionError(error: unknown): error is CreationError {
  return (
    error instanceof CreationError &&
    error.phase === 'Selection' &&
    error.code === 'NO_CORE_AFFIX'
  );
}

export async function previewCreationSelection(
  cultivatorId: string,
  materialIds: string[],
  craftType: string,
): Promise<{
  productType: CreationProductType;
  materials: MaterialRow[];
  validation: CreationPreviewValidation;
}> {
  const productType = getCreationProductTypeFromCraftType(craftType);
  if (!productType) {
    throw new CreationServiceError(`未知的造物类型: ${craftType}`);
  }

  const selectedMaterials = await loadOwnedMaterials(
    cultivatorId,
    materialIds,
    { rejectMystery: false },
  );
  const mysteryReason = getMysteryMaterialBlockingReason(selectedMaterials);
  if (mysteryReason) {
    return {
      productType,
      materials: selectedMaterials,
      validation: {
        valid: false,
        blockingReason: mysteryReason,
        warnings: [],
        missingMatchingManual: false,
      },
    };
  }
  const baseValidation = buildCreationPreviewValidation(
    productType,
    toCreationMaterials(selectedMaterials),
  );
  const validation = baseValidation.valid
    ? (() => {
        const blockingReason = resolvePreviewExecutionBlockingReason(
          productType,
          selectedMaterials,
        );
        return blockingReason
          ? {
              ...baseValidation,
              valid: false,
              blockingReason,
            }
          : baseValidation;
      })()
    : baseValidation;

  return {
    productType,
    materials: selectedMaterials,
    validation,
  };
}

/**
 * 主造物入口（炼器/神通/功法）。
 * 对应旧 CreationEngine.processRequest，但完全使用 v2 引擎和 creation_products 表。
 */
export async function prepareCreation(
  cultivatorId: string,
  materialIds: string[],
  craftType: string,
  options: CreationPreparationOptions = {},
): Promise<PreparedCreationV2> {
  const productType = getCreationProductTypeFromCraftType(craftType);
  if (!productType) {
    throw new CreationServiceError(`未知的造物类型: ${craftType}`);
  }

  const {
    materialQuantities,
    userPrompt,
    requestedSlot,
    requestedTargetPolicy,
  } = options;

  // Slot 只对 artifact 生效，其它产物传了也忽略，避免下游歧义。
  const effectiveRequestedSlot =
    productType === 'artifact' ? requestedSlot : undefined;

  // TargetPolicy 只对 skill 生效。
  const effectiveRequestedTargetPolicy =
    productType === 'skill' ? requestedTargetPolicy : undefined;

  // 分布式锁由 API/Application 层统一获取。
  const q = getExecutor();
  // 2. 加载并校验材料归属
  const selectedMaterials = await loadOwnedMaterials(
    cultivatorId,
    materialIds,
    {},
    q,
  );

  // 3. 加载角色（用于资源校验和容量检查）
  const [cultivator] = await q
    .select({
      userId: cultivators.userId,
      name: cultivators.name,
      realm: cultivators.realm,
      realm_stage: cultivators.realm_stage,
      spirit_stones: cultivators.spirit_stones,
      cultivation_progress: cultivators.cultivation_progress,
    })
    .from(cultivators)
    .where(eq(cultivators.id, cultivatorId))
    .limit(1);

  if (!cultivator) {
    throw new CreationServiceError('道友查无此人', 404);
  }

  const preHeavenFates = await getCultivatorPreHeavenFates(
    cultivatorId,
    q,
  );
  const fateContext = evaluateFateContext(preHeavenFates);

  // 4. 计算资源消耗
  const highestMaterialRank = calculateHighestMaterialRank(
    selectedMaterials as unknown as Array<{ rank: Quality }>,
  );
  const resourceType =
    productType === 'artifact' ? 'spiritStone' : 'comprehension';
  const baseCostAmount = calculateFateAdjustedCraftCost(
    highestMaterialRank,
    resourceType,
    resourceType === 'spiritStone'
      ? getRefineSpiritStoneMultiplier(fateContext)
      : fateContext.enlightenmentInsightMultiplier,
  );
  const costAmount =
    resourceType === 'spiritStone'
      ? await sectOrganizationFacade.applyCraftDiscount(
          cultivatorId,
          baseCostAmount,
          'sect.craft.refinery',
          q,
        )
      : baseCostAmount;

  // 校验资源是否充足
  if (resourceType === 'spiritStone') {
    if ((cultivator.spirit_stones ?? 0) < costAmount) {
      throw new CreationServiceError(
        `${getGameConceptLabel('spirit_stones')}不足，需要 ${costAmount} 枚`,
      );
    }
  } else {
    const progress = cultivator.cultivation_progress as {
      comprehension_insight?: number;
    } | null;
    if ((progress?.comprehension_insight ?? 0) < costAmount) {
      throw new CreationServiceError(
        `${getGameConceptLabel('comprehension_insight')}不足，需要 ${costAmount} 点`,
      );
    }
  }

  // 5. 计算每种材料本次“实际投入数量”（dose）。
  //
  // 来源：前端传入的 materialQuantities（可选，每个 id 映射 1..3 的整数）。
  // 规则：
  //   - 未传视为 1；
  //   - 被夹紧到 [minQuantityPerMaterial, maxQuantityPerMaterial]（V2 引擎硬约束）；
  //   - 不能超过仓库现存库存。
  //
  // 这里把 DB 行里的 quantity（仓库库存）换成 dose 再交给 orchestrator，
  // 既避免 CreationInputValidator 因库存 > 3 报 400，也允许玩家自由决定
  // 本次投入多少份，以影响 energyValue/dominantTags 等后续计算。
  const { minQuantityPerMaterial, maxQuantityPerMaterial } =
    CREATION_INPUT_CONSTRAINTS;

  const dosePerMaterial = new Map<string, number>();
  for (const material of selectedMaterials) {
    const requested = materialQuantities?.[material.id] ?? 1;
    if (!Number.isFinite(requested)) {
      throw new CreationServiceError(
        `材料「${material.name}」投入数量非法：${requested}`,
      );
    }

    const clamped = Math.min(
      maxQuantityPerMaterial,
      Math.max(minQuantityPerMaterial, Math.floor(requested)),
    );
    if (clamped > (material.quantity ?? 0)) {
      throw new CreationServiceError(
        `材料「${material.name}」库存不足：需要 ${clamped}，仅剩 ${material.quantity ?? 0}`,
      );
    }
    dosePerMaterial.set(material.id, clamped);
  }

  const engineMaterials = toCreationMaterials(
    selectedMaterials,
    dosePerMaterial,
  );

  const session = await orchestrator.craftAsync({
    cultivatorId,
    creatorName: cultivator.name,
    realm: cultivator.realm as RealmType,
    realmStage: cultivator.realm_stage as RealmStage,
    productType,
    materials: engineMaterials,
    ...(userPrompt?.trim() ? { userPrompt: userPrompt.trim() } : {}),
    ...(effectiveRequestedSlot
      ? { requestedSlot: effectiveRequestedSlot }
      : {}),
    ...(effectiveRequestedTargetPolicy
      ? { requestedTargetPolicy: effectiveRequestedTargetPolicy }
      : {}),
    ...(productType === 'skill'
      ? {
          projectionContext: {
            ownerKind: 'player',
            paceProfile: 'standard',
          },
        }
      : {}),
  });

  const outcome = session.state.outcome;
  if (!outcome) {
    const failure = session.state.failureReason;
    throw new CreationServiceError(failure ?? '造物失败，请检查材料组合');
  }

  // 6. 映射为 DB 行
  const row = toRow(outcome, cultivatorId);

  return {
    async commit(tx: DbTransaction) {
      const inventoryChanges: ResourceOperationSettlement['inventoryChanges'] =
        [];
      const commitRow = { ...row };
      const stableMaterialIds = [...materialIds].sort();
      const currentRows = await loadOwnedMaterials(
        cultivatorId,
        stableMaterialIds,
        {},
        tx,
      );
      const currentById = new Map(currentRows.map((item) => [item.id, item]));
      const expectedById = new Map(
        selectedMaterials.map((item) => [item.id, item]),
      );

      for (const id of stableMaterialIds) {
        const current = currentById.get(id);
        const expected = expectedById.get(id);
        if (
          !current ||
          !expected ||
          current.quantity !== expected.quantity ||
          current.rank !== expected.rank ||
          current.type !== expected.type ||
          current.element !== expected.element
        ) {
          throw new CreationServiceError(
            '材料已发生变化，请重新确认造物。',
            409,
          );
        }
      }

      if (resourceType === 'spiritStone') {
        const [charged] = await tx
          .update(cultivators)
          .set({
            spirit_stones: sql`${cultivators.spirit_stones} - ${costAmount}`,
          })
          .where(
            and(
              eq(cultivators.id, cultivatorId),
              eq(cultivators.userId, cultivator.userId),
              sql`${cultivators.spirit_stones} >= ${costAmount}`,
            ),
          )
          .returning({ id: cultivators.id });
        if (!charged) {
          throw new CreationServiceError(
            `${getGameConceptLabel('spirit_stones')}不足，需要 ${costAmount} 枚`,
            409,
          );
        }
      } else {
        const [charged] = await tx
          .update(cultivators)
          .set({
            cultivation_progress: sql`jsonb_set(
              COALESCE(${cultivators.cultivation_progress}, '{}'),
              '{comprehension_insight}',
              to_jsonb(COALESCE((${cultivators.cultivation_progress}->>'comprehension_insight')::int, 0) - ${costAmount})
            )`,
          })
          .where(
            and(
              eq(cultivators.id, cultivatorId),
              eq(cultivators.userId, cultivator.userId),
              sql`COALESCE((${cultivators.cultivation_progress}->>'comprehension_insight')::int, 0) >= ${costAmount}`,
            ),
          )
          .returning({ id: cultivators.id });
        if (!charged) {
          throw new CreationServiceError(
            `${getGameConceptLabel('comprehension_insight')}不足，需要 ${costAmount} 点`,
            409,
          );
        }
      }

      for (const id of stableMaterialIds) {
        const expected = expectedById.get(id);
        const dose = dosePerMaterial.get(id) ?? 1;
        if (!expected) {
          throw new CreationServiceError('材料记录异常，无法扣除', 500);
        }
        if (expected.quantity > dose) {
          const updated = await tx
            .update(materials)
            .set({ quantity: sql`${materials.quantity} - ${dose}` })
            .where(
              and(
                eq(materials.id, id),
                eq(materials.cultivatorId, cultivatorId),
                eq(materials.quantity, expected.quantity),
              ),
            )
            .returning();
          if (updated.length !== 1) {
            throw new CreationServiceError(
              '材料已发生变化，请重新确认造物。',
              409,
            );
          }
          inventoryChanges.push({
            kind: 'materials',
            operation: 'upsert',
            item: mapMaterialRow(updated[0]),
          });
        } else {
          const deleted = await tx
            .delete(materials)
            .where(
              and(
                eq(materials.id, id),
                eq(materials.cultivatorId, cultivatorId),
                eq(materials.quantity, expected.quantity),
              ),
            )
            .returning({ id: materials.id });
          if (deleted.length !== 1) {
            throw new CreationServiceError(
              '材料已发生变化，请重新确认造物。',
              409,
            );
          }
          inventoryChanges.push({
            kind: 'materials',
            operation: 'remove',
            id,
          });
        }
      }

      let insertedId = '';
      let needsReplace = false;
      let currentCount = 0;
      let maxCount = 0;
      let afterCommit: (() => Promise<void>) | undefined;

      if (isEquipManagedProductType(productType)) {
        currentCount = await creationProductRepository.countByType(
          cultivatorId,
          productType,
          tx,
        );
        maxCount = MAX_OWNED_CREATION_PRODUCTS_PER_TYPE;
        needsReplace = currentCount >= maxCount;

        const effectiveLimit = getEffectiveProductLimit(productType);
        const equippedCount =
          await creationProductRepository.countEquippedByType(
            cultivatorId,
            productType,
            tx,
          );
        commitRow.isEquipped =
          effectiveLimit !== null && equippedCount < effectiveLimit;
        if (
          productType === 'skill' &&
          (await loadCultivatorSectState(cultivatorId, tx))?.status === 'active'
        ) {
          commitRow.isEquipped = false;
        }
      }

      if (needsReplace) {
        const snapshot = snapshotCraftedOutcome(outcome);
        const pendingPayload: PendingCreationPayload = {
          snapshot: serializeCraftedOutcomeSnapshot(snapshot),
          previewName: commitRow.name,
          previewQuality: commitRow.quality ?? null,
          previewElement: commitRow.element ?? null,
        };
        afterCommit = async () => {
          await cachePendingCreation(cultivatorId, craftType, pendingPayload);
        };
      } else {
        const record = await creationProductRepository.insert(commitRow, tx);
        insertedId = record.id;
        if (productType === 'artifact') {
          inventoryChanges.push({
            kind: 'artifacts',
            operation: 'upsert',
            item: toArtifactFromProduct(record),
          });
        }
      }

      const result = needsReplace
        ? {
            ...buildCreationResult(outcome, commitRow, ''),
            needs_replace: true,
            currentCount,
            maxCount,
          }
        : buildCreationResult(outcome, commitRow, insertedId);
      return { result, inventoryChanges, afterCommit };
    },
  };
}

/**
 * 获取 Redis 暂存的待替换产物预览信息。
 */
export async function getPendingCreation(
  cultivatorId: string,
  craftType: string,
): Promise<PendingCreationItem | null> {
  const pending = await loadPendingCreation(cultivatorId, craftType);
  if (!pending) return null;
  const productType = getCreationProductTypeFromCraftType(craftType);
  if (!productType) {
    throw new CreationServiceError(`未知的造物类型: ${craftType}`);
  }

  const snapshot = deserializeCraftedOutcomeSnapshot(pending.payload.snapshot);
  const outcome = restoreCraftedOutcome(snapshot, new CreationAbilityAdapter());
  const row = toRow(outcome, cultivatorId);

  return buildPendingCreationItem(outcome, row, pending.payload.snapshot);
}

export async function prepareCreationConfirmation(
  cultivatorId: string,
  craftType: string,
  replaceId: string | null,
) {
  const pending = await loadPendingCreation(cultivatorId, craftType);
  if (!pending) {
    throw new CreationServiceError('未找到待确认的造物结果，可能已过期', 404);
  }
  const snapshot = deserializeCraftedOutcomeSnapshot(pending.payload.snapshot);
  const outcome = restoreCraftedOutcome(snapshot, new CreationAbilityAdapter());
  const preparedRow = toRow(outcome, cultivatorId);
  const productType = preparedRow.productType as CreationProductType;

  return {
    async commit(tx: DbTransaction) {
      const inventoryChanges: ResourceOperationSettlement['inventoryChanges'] =
        [];
      const [cultivator] = await tx
        .select({ id: cultivators.id })
        .from(cultivators)
        .where(eq(cultivators.id, cultivatorId))
        .limit(1);
      if (!cultivator) {
        throw new CreationServiceError('道友查无此人', 404);
      }

      const row = { ...preparedRow };
      let replacedWasEquipped = false;
      if (replaceId) {
        // 验证被替换产物归属
        const existing = await creationProductRepository.findById(
          replaceId,
          tx,
        );
        if (!existing || existing.cultivatorId !== cultivatorId) {
          throw new CreationServiceError('目标产物不存在或不属于你', 403);
        }
        if (existing.productType !== productType) {
          throw new CreationServiceError('只能替换同类产物', 400);
        }
        replacedWasEquipped = existing.isEquipped;
        await creationProductRepository.deleteById(replaceId, tx);
        if (productType === 'artifact') {
          inventoryChanges.push({
            kind: 'artifacts',
            operation: 'remove',
            id: replaceId,
          });
        }
      }

      if (isEquipManagedProductType(productType)) {
        const currentCount = await creationProductRepository.countByType(
          cultivatorId,
          productType,
          tx,
        );
        if (
          currentCount >= MAX_OWNED_CREATION_PRODUCTS_PER_TYPE &&
          !replaceId
        ) {
          throw new CreationServiceError(
            `${getCreationProductTypeLabel(productType)}数量已达上限，请先选择一项替换`,
            409,
          );
        }

        const effectiveLimit = getEffectiveProductLimit(productType);
        const equippedCount =
          await creationProductRepository.countEquippedByType(
            cultivatorId,
            productType,
            tx,
          );
        row.isEquipped =
          replacedWasEquipped ||
          (effectiveLimit !== null && equippedCount < effectiveLimit);
        if (
          productType === 'skill' &&
          (await loadCultivatorSectState(cultivatorId, tx))?.status === 'active'
        ) {
          row.isEquipped = false;
        }
      }

      const record = await creationProductRepository.insert(row, tx);
      const insertedId = record.id;
      if (productType === 'artifact') {
        inventoryChanges.push({
          kind: 'artifacts',
          operation: 'upsert',
          item: toArtifactFromProduct(record),
        });
      }

      return {
        result: buildCreationResult(outcome, row, insertedId),
        inventoryChanges,
        afterCommit: async () => {
          await cachePendingCreation(cultivatorId, craftType, null);
        },
      };
    },
  };
}

/**
 * 放弃 Redis 暂存的待替换产物。
 */
export async function abandonPending(
  cultivatorId: string,
  craftType: string,
): Promise<void> {
  await cachePendingCreation(cultivatorId, craftType, null);
}

/**
 * 从 RolledAffix[] 中提取前端结果页需要的摘要信息。
 */
function extractAffixSummary(
  affixes: Array<{
    id: string;
    name: string;
    slot: string;
    rarity: string;
    isPerfect: boolean;
    rollEfficiency: number;
  }>,
) {
  return affixes.map((affix) => ({
    id: affix.id,
    name: affix.name,
    slot: affix.slot,
    rarity: affix.rarity,
    isPerfect: affix.isPerfect,
    rollEfficiency: affix.rollEfficiency,
  }));
}

/** 造物消耗预估（供 GET /api/craft 使用） */
export async function estimateCost(
  selectedMaterials: Array<{ rank: Quality }>,
  craftType: string,
  fates: PreHeavenFate[] = [],
  cultivatorId?: string,
): Promise<{ spiritStones?: number; comprehension?: number }> {
  const productType = getCreationProductTypeFromCraftType(craftType);
  if (!productType) return {};

  const highestMaterialRank = calculateHighestMaterialRank(selectedMaterials);
  const fateContext = evaluateFateContext(fates);
  if (productType === 'artifact') {
    const baseCost = calculateFateAdjustedCraftCost(
      highestMaterialRank,
      'spiritStone',
      getRefineSpiritStoneMultiplier(fateContext),
    );
    return {
      spiritStones: cultivatorId
        ? await sectOrganizationFacade.applyCraftDiscount(
            cultivatorId,
            baseCost,
            'sect.craft.refinery',
          )
        : baseCost,
    };
  }

  return {
    comprehension: calculateFateAdjustedCraftCost(
      highestMaterialRank,
      'comprehension',
      fateContext.enlightenmentInsightMultiplier,
    ),
  };
}
