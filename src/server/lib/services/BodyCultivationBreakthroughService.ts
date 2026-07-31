import {
  getExecutor,
  runDbTasks,
  type DbExecutor,
  type DbTransaction,
} from '@server/lib/drizzle/db';
import * as schema from '@server/lib/drizzle/schema';
import {
  consumeConsumableById,
  consumeMaterialById,
} from '@server/lib/services/cultivator/CultivatorInventoryRepository';
import type {
  BodyCultivationBreakthroughCostRequirement,
  BodyCultivationBreakthroughInventoryRequirement,
  BodyCultivationBreakthroughReadinessData,
  BodyCultivationBreakthroughRequest,
} from '@shared/contracts/bodyCultivation';
import type { ResourceOperationSettlement } from '@shared/engine/resource/types';
import { canonicalizeAlchemyPropertyKey } from '@shared/lib/alchemyProperties';
import {
  previewBodyCultivationRealmBreakthrough,
  type BodyCultivationRealmBreakthroughCost,
} from '@shared/lib/bodyCultivation/breakthrough';
import { isPillConsumable } from '@shared/lib/consumables';
import type { Quality } from '@shared/types/constants';
import { QUALITY_ORDER } from '@shared/types/constants';
import type { CompatibleAlchemyPropertyKey } from '@shared/types/consumable';
import type {
  Consumable,
  Cultivator,
  Material,
} from '@shared/types/cultivator';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { mapConsumableRow } from './consumablePersistence';

export type BodyCultivationFacts = Pick<
  Cultivator,
  'id' | 'realm' | 'condition'
>;

export async function loadPlayerBodyCultivationFacts(
  userId: string,
  cultivatorId: string,
  q: DbExecutor | DbTransaction = getExecutor(),
): Promise<BodyCultivationFacts | null> {
  const [row] = await q
    .select({
      id: schema.cultivators.id,
      realm: schema.cultivators.realm,
      condition: schema.cultivators.condition,
    })
    .from(schema.cultivators)
    .where(
      and(
        eq(schema.cultivators.id, cultivatorId),
        eq(schema.cultivators.userId, userId),
        eq(schema.cultivators.status, 'active'),
      ),
    )
    .limit(1);
  return row
    ? {
        id: row.id,
        realm: row.realm as Cultivator['realm'],
        condition:
          (row.condition as Cultivator['condition'] | null) ?? undefined,
      }
    : null;
}

export interface BodyCultivationBreakthroughCostPlan {
  requirements: BodyCultivationBreakthroughInventoryRequirement[];
  consumables: Array<{ id: string; quantity: number }>;
  materials: Array<{ id: string; quantity: number }>;
}

function getQualityOrder(quality: Quality | undefined): number {
  return quality ? (QUALITY_ORDER[quality] ?? -1) : -1;
}

function getEligibleQualities(minQuality: Quality): Quality[] {
  const minOrder = getQualityOrder(minQuality);
  return (Object.keys(QUALITY_ORDER) as Quality[]).filter(
    (quality) => getQualityOrder(quality) >= minOrder,
  );
}

function toCostRequirement(
  cost: BodyCultivationRealmBreakthroughCost,
): BodyCultivationBreakthroughCostRequirement {
  if (cost.type === 'material') {
    return {
      type: cost.type,
      name: cost.name,
      label: cost.label,
      quantity: cost.quantity,
      materialType: cost.materialType,
      minQuality: cost.minQuality,
    };
  }

  return {
    type: cost.type,
    name: cost.name,
    label: cost.label,
    quantity: cost.quantity,
    family: cost.family,
    property: cost.property,
    minQuality: cost.minQuality,
  };
}

function getCostKey(cost: BodyCultivationRealmBreakthroughCost): string {
  if (cost.type === 'material') {
    return `${cost.type}:${cost.materialType}:${cost.minQuality}`;
  }

  return `${cost.type}:${cost.family}:${cost.property}:${cost.minQuality}`;
}

function toMaterial(row: typeof schema.materials.$inferSelect): Material {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Material['type'],
    rank: row.rank as Quality,
    quantity: row.quantity,
    description: row.description ?? '',
    element: row.element as Material['element'],
    details: row.details as Material['details'],
  };
}

function isMatchingBodyBreakthroughMaterial(
  material: Material,
  cost: Extract<BodyCultivationRealmBreakthroughCost, { type: 'material' }>,
): boolean {
  return (
    material.type === cost.materialType &&
    getQualityOrder(material.rank) >= getQualityOrder(cost.minQuality)
  );
}

function isMatchingBodyBreakthroughPill(
  consumable: Consumable,
  cost: Extract<BodyCultivationRealmBreakthroughCost, { type: 'consumable' }>,
): boolean {
  if (!isPillConsumable(consumable) || consumable.spec.family !== cost.family) {
    return false;
  }

  if (getQualityOrder(consumable.quality) < getQualityOrder(cost.minQuality)) {
    return false;
  }

  const propertyVector = consumable.spec.alchemyMeta?.propertyVector;
  if (!Array.isArray(propertyVector)) {
    return false;
  }

  return propertyVector.some((property) => {
    const key = (property as { key?: unknown }).key;
    const weight = (property as { weight?: unknown }).weight;
    if (typeof key !== 'string' || typeof weight !== 'number') {
      return false;
    }

    return (
      canonicalizeAlchemyPropertyKey(key as CompatibleAlchemyPropertyKey) ===
        cost.property && weight > 0
    );
  });
}

export function getBodyCultivationBreakthroughPreviewData(
  cultivator: BodyCultivationFacts,
): BodyCultivationBreakthroughReadinessData {
  const preview = previewBodyCultivationRealmBreakthrough(
    cultivator.condition,
    {
      cultivatorRealm: cultivator.realm,
    },
  );

  return {
    nextRealm: preview.nextRealm,
    canAttempt: preview.canAttempt,
    successChance: preview.successChance,
    guaranteeProgress: preview.guaranteeProgress,
    failedAttempts: preview.failedAttempts,
    ruleRequirements: preview.requirements,
    costRequirements: preview.costs.map(toCostRequirement),
  };
}

async function getCandidateMaterialsByIds(
  cultivator: BodyCultivationFacts,
  ids: string[],
  q: DbExecutor | DbTransaction,
): Promise<Material[]> {
  if (ids.length === 0) return [];

  const rows = await q
    .select()
    .from(schema.materials)
    .where(
      and(
        eq(schema.materials.cultivatorId, cultivator.id!),
        inArray(schema.materials.id, ids),
      ),
    );

  return rows.map(toMaterial);
}

async function getCandidateConsumablesByIds(
  cultivator: BodyCultivationFacts,
  ids: string[],
  q: DbExecutor | DbTransaction,
): Promise<Consumable[]> {
  if (ids.length === 0) return [];

  const rows = await q
    .select()
    .from(schema.consumables)
    .where(
      and(
        eq(schema.consumables.cultivatorId, cultivator.id!),
        inArray(schema.consumables.id, ids),
      ),
    );

  return rows.map(mapConsumableRow);
}

function normalizeSelections(
  selections: BodyCultivationBreakthroughRequest['materialSelections'],
): Array<{ id: string; quantity: number }> {
  const selectionMap = new Map<string, number>();

  for (const selection of selections) {
    const id = selection.id.trim();
    const quantity = Math.floor(selection.quantity);
    if (!id || quantity <= 0) {
      throw new Error('突破材料选择不完整。');
    }
    selectionMap.set(id, (selectionMap.get(id) ?? 0) + quantity);
  }

  return [...selectionMap.entries()].map(([id, quantity]) => ({
    id,
    quantity,
  }));
}

function assignSelectionToCost(args: {
  itemName: string;
  quantity: number;
  matchingCosts: BodyCultivationRealmBreakthroughCost[];
  totalsByCostKey: Map<string, number>;
}): void {
  const targetCost = args.matchingCosts.find((cost) => {
    const current = args.totalsByCostKey.get(getCostKey(cost)) ?? 0;
    return current + args.quantity <= cost.quantity;
  });

  if (!targetCost) {
    throw new Error(
      args.matchingCosts.length > 0
        ? `${args.itemName} 的选择数量超过突破所需。`
        : `${args.itemName} 不符合本次肉身破限要求。`,
    );
  }

  const key = getCostKey(targetCost);
  args.totalsByCostKey.set(
    key,
    (args.totalsByCostKey.get(key) ?? 0) + args.quantity,
  );
}

export async function listEligibleBodyCultivationBreakthroughItems(
  cultivator: BodyCultivationFacts,
  options: {
    materialPage: number;
    consumablePage: number;
    pageSize: number;
  },
  q: DbExecutor | DbTransaction = getExecutor(),
): Promise<{
  requirements: BodyCultivationBreakthroughCostRequirement[];
  materials: Array<Material & { requirementLabel: string }>;
  consumables: Array<Consumable & { requirementLabel: string }>;
  pagination: {
    materials: { page: number; pageSize: number; total: number };
    consumables: { page: number; pageSize: number; total: number };
  };
}> {
  const preview = previewBodyCultivationRealmBreakthrough(
    cultivator.condition,
    {
      cultivatorRealm: cultivator.realm,
    },
  );
  const materialCosts = preview.costs.filter(
    (
      cost,
    ): cost is Extract<
      BodyCultivationRealmBreakthroughCost,
      { type: 'material' }
    > => cost.type === 'material',
  );
  const consumableCosts = preview.costs.filter(
    (
      cost,
    ): cost is Extract<
      BodyCultivationRealmBreakthroughCost,
      { type: 'consumable' }
    > => cost.type === 'consumable',
  );

  let materialCandidates: Material[] = [];
  let materialTotal = 0;
  if (materialCosts.length > 0) {
    const condition = and(
      eq(schema.materials.cultivatorId, cultivator.id!),
      sql`${schema.materials.quantity} > 0`,
      or(
        ...materialCosts.map((cost) =>
          and(
            eq(schema.materials.type, cost.materialType),
            inArray(
              schema.materials.rank,
              getEligibleQualities(cost.minQuality),
            ),
          ),
        ),
      ),
    );
    const [rows, totals] = await runDbTasks(q, [
      () =>
        q
          .select()
          .from(schema.materials)
          .where(condition)
          .orderBy(desc(schema.materials.createdAt), asc(schema.materials.id))
          .limit(options.pageSize)
          .offset((options.materialPage - 1) * options.pageSize),
      () =>
        q
          .select({ total: sql<number>`count(*)::int` })
          .from(schema.materials)
          .where(condition),
    ]);
    materialTotal = Number(totals[0]?.total ?? 0);
    materialCandidates = rows.map(toMaterial);
  }

  let consumableCandidates: Consumable[] = [];
  let consumableTotal = 0;
  if (consumableCosts.length > 0) {
    const condition = and(
      eq(schema.consumables.cultivatorId, cultivator.id!),
      eq(schema.consumables.type, '丹药'),
      sql`${schema.consumables.quantity} > 0`,
      sql`${schema.consumables.spec} ->> 'kind' = 'pill'`,
      or(
        ...consumableCosts.map((cost) =>
          and(
            sql`${schema.consumables.spec} ->> 'family' = ${cost.family}`,
            inArray(
              schema.consumables.quality,
              getEligibleQualities(cost.minQuality),
            ),
            sql`exists (
              select 1
              from jsonb_array_elements(
                coalesce(
                  ${schema.consumables.spec} -> 'alchemyMeta' -> 'propertyVector',
                  '[]'::jsonb
                )
              ) as property
              where property ->> 'key' = ${cost.property}
                and coalesce((property ->> 'weight')::numeric, 0) > 0
            )`,
          ),
        ),
      ),
    );
    const [rows, totals] = await runDbTasks(q, [
      () =>
        q
          .select()
          .from(schema.consumables)
          .where(condition)
          .orderBy(
            desc(schema.consumables.createdAt),
            asc(schema.consumables.id),
          )
          .limit(options.pageSize)
          .offset((options.consumablePage - 1) * options.pageSize),
      () =>
        q
          .select({ total: sql<number>`count(*)::int` })
          .from(schema.consumables)
          .where(condition),
    ]);
    consumableTotal = Number(totals[0]?.total ?? 0);
    consumableCandidates = rows.map(mapConsumableRow);
  }

  return {
    requirements: preview.costs.map(toCostRequirement),
    materials: materialCandidates.flatMap((material) => {
      const matchedCost = materialCosts.find((cost) =>
        isMatchingBodyBreakthroughMaterial(material, cost),
      );
      return matchedCost && material.id
        ? [{ ...material, requirementLabel: matchedCost.label }]
        : [];
    }),
    consumables: consumableCandidates.flatMap((consumable) => {
      const matchedCost = consumableCosts.find((cost) =>
        isMatchingBodyBreakthroughPill(consumable, cost),
      );
      return matchedCost && consumable.id
        ? [{ ...consumable, requirementLabel: matchedCost.label }]
        : [];
    }),
    pagination: {
      materials: {
        page: options.materialPage,
        pageSize: options.pageSize,
        total: materialTotal,
      },
      consumables: {
        page: options.consumablePage,
        pageSize: options.pageSize,
        total: consumableTotal,
      },
    },
  };
}

export async function planBodyCultivationBreakthroughSelections(
  cultivator: BodyCultivationFacts,
  request: BodyCultivationBreakthroughRequest,
  q: DbExecutor | DbTransaction = getExecutor(),
): Promise<BodyCultivationBreakthroughCostPlan> {
  const preview = previewBodyCultivationRealmBreakthrough(
    cultivator.condition,
    {
      cultivatorRealm: cultivator.realm,
    },
  );
  if (!preview.nextRealm) {
    throw new Error('肉身已达最高阶位。');
  }
  if (!preview.canAttempt) {
    const missing = preview.requirements
      .filter((requirement) => !requirement.met)
      .map((requirement) => requirement.label)
      .join('、');
    throw new Error(`肉身进阶条件不足：${missing || '基础条件不足'}`);
  }

  const materialCosts = preview.costs.filter(
    (
      cost,
    ): cost is Extract<
      BodyCultivationRealmBreakthroughCost,
      { type: 'material' }
    > => cost.type === 'material',
  );
  const consumableCosts = preview.costs.filter(
    (
      cost,
    ): cost is Extract<
      BodyCultivationRealmBreakthroughCost,
      { type: 'consumable' }
    > => cost.type === 'consumable',
  );
  const materialSelections = normalizeSelections(request.materialSelections);
  const consumableSelections = normalizeSelections(
    request.consumableSelections,
  );
  const selectedMaterials = await getCandidateMaterialsByIds(
    cultivator,
    materialSelections.map((selection) => selection.id),
    q,
  );
  const selectedConsumables = await getCandidateConsumablesByIds(
    cultivator,
    consumableSelections.map((selection) => selection.id),
    q,
  );
  const materialsById = new Map(
    selectedMaterials.flatMap((material) =>
      material.id ? [[material.id, material] as const] : [],
    ),
  );
  const consumablesById = new Map(
    selectedConsumables.flatMap((consumable) =>
      consumable.id ? [[consumable.id, consumable] as const] : [],
    ),
  );
  const totalsByCostKey = new Map<string, number>();
  const materialPlan: BodyCultivationBreakthroughCostPlan['materials'] = [];
  const consumablePlan: BodyCultivationBreakthroughCostPlan['consumables'] = [];

  for (const selection of materialSelections) {
    const material = materialsById.get(selection.id);
    if (!material) {
      throw new Error('所选材料不存在或不属于当前角色。');
    }
    if (selection.quantity > material.quantity) {
      throw new Error(`${material.name} 数量不足。`);
    }
    assignSelectionToCost({
      itemName: material.name,
      quantity: selection.quantity,
      matchingCosts: materialCosts.filter((cost) =>
        isMatchingBodyBreakthroughMaterial(material, cost),
      ),
      totalsByCostKey,
    });
    materialPlan.push({ id: selection.id, quantity: selection.quantity });
  }

  for (const selection of consumableSelections) {
    const consumable = consumablesById.get(selection.id);
    if (!consumable) {
      throw new Error('所选丹药不存在或不属于当前角色。');
    }
    if (selection.quantity > consumable.quantity) {
      throw new Error(`${consumable.name} 数量不足。`);
    }
    assignSelectionToCost({
      itemName: consumable.name,
      quantity: selection.quantity,
      matchingCosts: consumableCosts.filter((cost) =>
        isMatchingBodyBreakthroughPill(consumable, cost),
      ),
      totalsByCostKey,
    });
    consumablePlan.push({ id: selection.id, quantity: selection.quantity });
  }

  const requirements = preview.costs.map((cost) => {
    const selectedQuantity = totalsByCostKey.get(getCostKey(cost)) ?? 0;
    return {
      ...toCostRequirement(cost),
      ownedQuantity: selectedQuantity,
      met: selectedQuantity === cost.quantity,
    };
  });

  for (const cost of preview.costs) {
    const selectedQuantity = totalsByCostKey.get(getCostKey(cost)) ?? 0;
    if (selectedQuantity !== cost.quantity) {
      throw new Error(
        `${cost.label} ${selectedQuantity}/${cost.quantity}，请重新选择。`,
      );
    }
  }

  return {
    requirements,
    materials: materialPlan,
    consumables: consumablePlan,
  };
}

export async function consumeBodyCultivationBreakthroughCosts(
  userId: string,
  cultivatorId: string,
  plan: BodyCultivationBreakthroughCostPlan,
  tx: DbTransaction,
): Promise<ResourceOperationSettlement['inventoryChanges']> {
  const changes: ResourceOperationSettlement['inventoryChanges'] = [];
  for (const material of plan.materials) {
    const change = await consumeMaterialById(
      userId,
      cultivatorId,
      material.id,
      material.quantity,
      tx,
    );
    changes.push(
      change.operation === 'upsert'
        ? { kind: 'materials', operation: 'upsert', item: change.item }
        : { kind: 'materials', operation: 'remove', id: change.id },
    );
  }

  for (const consumable of plan.consumables) {
    const change = await consumeConsumableById(
      userId,
      cultivatorId,
      consumable.id,
      consumable.quantity,
      tx,
    );
    changes.push(
      change.remaining
        ? {
            kind: 'consumables',
            operation: 'upsert',
            item: change.remaining,
          }
        : {
            kind: 'consumables',
            operation: 'remove',
            id: consumable.id,
          },
    );
  }
  return changes;
}
