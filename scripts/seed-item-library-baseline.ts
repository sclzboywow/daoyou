import { db } from '@server/lib/drizzle/db';
import {
  createItemLibraryEntry,
  findItemLibraryByItemIds,
  updateItemLibraryEntry,
} from '@server/lib/repositories/itemLibraryRepository';
import {
  generateDailyMarketMaterialLibraryEntries,
  ITEM_LIBRARY_SYSTEM_USER_ID,
} from '@server/lib/services/MaterialLibraryService';
import {
  createReputationShopItem,
  listReputationShopItems,
} from '@server/lib/services/ReputationShopService';
import {
  createSectShopItem,
  listSectShopItems,
} from '@server/lib/services/SectShopService';
import { serializeProductModel } from '@shared/engine/creation-v2/persistence/ProductPersistenceMapper';
import { calculateProductScore } from '@shared/engine/creation-v2/persistence/ScoreCalculator';
import { buildPresetArtifact } from '@shared/engine/cultivator/creation/presetProducts';
import { buildCultivationBoostOperation } from '@shared/lib/cultivationBoost';
import {
  CreateItemLibraryEntrySchema,
  type CreateItemLibraryEntry,
} from '@shared/lib/itemLibrary';
import {
  buildPositivePillToxicity,
  buildRestorePercent,
} from '@shared/lib/pillEffectScaling';
import { calculatePillScore } from '@shared/lib/pillScore';
import type {
  ElementType,
  EquipmentSlot,
  Quality,
  RealmType,
} from '@shared/types/constants';
import type { PillFamily, PillSpec } from '@shared/types/consumable';

type RealmCatalogTier = {
  realm: RealmType;
  quality: Quality;
  element: ElementType;
  pills: [string, string, string];
  artifacts: [string, string, string];
};

const REALM_CATALOG: RealmCatalogTier[] = [
  {
    realm: '炼气',
    quality: '凡品',
    element: '木',
    pills: ['小还丹', '纳气丹', '养元丹'],
    artifacts: ['青竹剑', '玄铁衣', '聚灵佩'],
  },
  {
    realm: '筑基',
    quality: '灵品',
    element: '水',
    pills: ['玉露回春丹', '聚灵丹', '固基丹'],
    artifacts: ['流云剑', '碧水法袍', '定元环'],
  },
  {
    realm: '金丹',
    quality: '玄品',
    element: '火',
    pills: ['紫府还元丹', '金液丹', '凝丹丸'],
    artifacts: ['赤霄剑', '金鳞甲', '紫府印'],
  },
  {
    realm: '元婴',
    quality: '真品',
    element: '冰',
    pills: ['九转回魂丹', '婴元丹', '化婴丹'],
    artifacts: ['星河刃', '玄冥法衣', '婴元珠'],
  },
  {
    realm: '化神',
    quality: '地品',
    element: '土',
    pills: ['太清复元丹', '神元丹', '养神丹'],
    artifacts: ['太乙神锋', '五岳玄甲', '神游镜'],
  },
  {
    realm: '炼虚',
    quality: '天品',
    element: '风',
    pills: ['虚灵续命丹', '太虚丹', '炼虚丹'],
    artifacts: ['虚空剑匣', '太虚云袍', '两仪环'],
  },
  {
    realm: '合体',
    quality: '天品',
    element: '金',
    pills: ['阴阳还真丹', '合元丹', '同参丹'],
    artifacts: ['阴阳法剑', '天罡宝甲', '乾坤鉴'],
  },
  {
    realm: '大乘',
    quality: '仙品',
    element: '雷',
    pills: ['仙露回天丹', '大乘元丹', '登仙丹'],
    artifacts: ['大罗仙剑', '九霄仙衣', '周天星盘'],
  },
  {
    realm: '渡劫',
    quality: '神品',
    element: '雷',
    pills: ['九霄渡厄丹', '雷劫元丹', '渡劫丹'],
    artifacts: ['雷劫天刃', '万劫不灭甲', '渡厄神珠'],
  },
];

const ARTIFACT_CONFIG: Record<
  EquipmentSlot,
  { suffix: string; affixIds: [string, string] }
> = {
  weapon: {
    suffix: 'weapon',
    affixIds: ['artifact-panel-weapon-dual-atk', 'artifact-panel-atk'],
  },
  armor: {
    suffix: 'armor',
    affixIds: ['artifact-panel-armor-dual-def', 'artifact-panel-def'],
  },
  accessory: {
    suffix: 'accessory',
    affixIds: ['artifact-panel-accessory-utility', 'artifact-panel-vitality'],
  },
};

const REALM_ID: Record<RealmType, string> = {
  炼气: 'qi',
  筑基: 'foundation',
  金丹: 'core',
  元婴: 'nascent',
  化神: 'spirit',
  炼虚: 'void',
  合体: 'fusion',
  大乘: 'mahayana',
  渡劫: 'tribulation',
};

function buildPillEntry(
  tier: RealmCatalogTier,
  kind: 'healing' | 'mana' | 'cultivation',
  name: string,
): CreateItemLibraryEntry {
  const family: PillFamily =
    kind === 'healing' ? 'healing' : kind === 'mana' ? 'mana' : 'cultivation';
  const operations: PillSpec['operations'] =
    kind === 'cultivation'
      ? [buildCultivationBoostOperation(tier.quality)]
      : [
          {
            type: 'restore_resource',
            resource: kind === 'healing' ? 'hp' : 'mp',
            mode: 'percent',
            value: buildRestorePercent(tier.quality),
          },
        ];
  const spec: PillSpec = {
    kind: 'pill',
    family,
    operations,
    consumeRules: {
      scene: 'out_of_battle_only',
      quotaCategory: 'none',
    },
    alchemyMeta: {
      source: 'improvised',
      sourceMaterials: [],
      dominantElement: tier.element,
      stability: 0.9,
      toxicityRating: buildPositivePillToxicity(tier.quality),
      appearance: tier.quality === '凡品' ? 'middle' : 'high',
      tags: ['道具库标准品', tier.realm, kind],
    },
  };
  const score =
    calculatePillScore({ quality: tier.quality, spec }) ?? undefined;
  const purpose =
    kind === 'healing'
      ? '恢复气血'
      : kind === 'mana'
        ? '恢复法力'
        : '提升下一次闭关修炼收益';

  return CreateItemLibraryEntrySchema.parse({
    itemId: `pill_${REALM_ID[tier.realm]}_${kind}`,
    type: 'consumable',
    status: 'published',
    payload: {
      name,
      type: '丹药',
      quality: tier.quality,
      description: `${tier.realm}阶段常用的标准丹药，可${purpose}。`,
      score,
      spec,
    },
    editorConfig: {
      source: 'curated_realm_baseline',
      realm: tier.realm,
      role: kind,
    },
  });
}

function buildArtifactEntry(
  tier: RealmCatalogTier,
  slot: EquipmentSlot,
  name: string,
): CreateItemLibraryEntry {
  const config = ARTIFACT_CONFIG[slot];
  const artifact = buildPresetArtifact({
    name,
    slot,
    element: tier.element,
    quality: tier.quality,
    description: `${tier.realm}修士适用的标准${slot === 'weapon' ? '攻伐' : slot === 'armor' ? '护体' : '辅助'}法器。`,
    affixIds: config.affixIds,
    realm: tier.realm,
    realmStage: '初期',
    creatorName: '道具库',
    creatorCultivatorId: 'item-library',
    isEquipped: false,
  });
  const productModel = serializeProductModel(artifact.productModel);

  return CreateItemLibraryEntrySchema.parse({
    itemId: `artifact_${REALM_ID[tier.realm]}_${config.suffix}`,
    type: 'artifact',
    status: 'published',
    payload: {
      name: artifact.name,
      slot,
      element: artifact.element,
      quality: artifact.quality,
      description: artifact.description,
      score: calculateProductScore(
        artifact.productModel.balanceMetrics,
        artifact.productModel.affixes,
      ),
      productModel,
    },
    editorConfig: {
      slot,
      element: tier.element,
      quality: tier.quality,
      realm: tier.realm,
      realmStage: '初期',
      affixIds: config.affixIds,
    },
  });
}

function buildCuratedEntries(): CreateItemLibraryEntry[] {
  return REALM_CATALOG.flatMap((tier) => [
    buildPillEntry(tier, 'healing', tier.pills[0]),
    buildPillEntry(tier, 'mana', tier.pills[1]),
    buildPillEntry(tier, 'cultivation', tier.pills[2]),
    buildArtifactEntry(tier, 'weapon', tier.artifacts[0]),
    buildArtifactEntry(tier, 'armor', tier.artifacts[1]),
    buildArtifactEntry(tier, 'accessory', tier.artifacts[2]),
  ]);
}

async function upsertCuratedEntries(entries: CreateItemLibraryEntry[]) {
  const existing = new Map(
    (await findItemLibraryByItemIds(entries.map((entry) => entry.itemId))).map(
      (entry) => [entry.itemId, entry],
    ),
  );
  let created = 0;
  let updated = 0;
  for (const entry of entries) {
    const current = existing.get(entry.itemId);
    if (current) {
      await updateItemLibraryEntry({
        id: current.id,
        entry,
        userId: ITEM_LIBRARY_SYSTEM_USER_ID,
      });
      updated += 1;
    } else {
      await createItemLibraryEntry({
        entry,
        userId: ITEM_LIBRARY_SYSTEM_USER_ID,
      });
      created += 1;
    }
  }
  return { created, updated };
}

async function seedShops() {
  const currentSectIds = new Set(
    (await listSectShopItems()).map((item) => item.itemLibraryItemId),
  );
  const currentReputationIds = new Set(
    (await listReputationShopItems()).map((item) => item.itemLibraryItemId),
  );
  const sectItems = [
    ['pill_qi_healing', 35, 3, 10],
    ['pill_qi_mana', 30, 3, 20],
    ['pill_qi_cultivation', 60, 2, 30],
    ['artifact_qi_weapon', 220, 1, 40],
    ['artifact_qi_armor', 220, 1, 50],
    ['artifact_qi_accessory', 260, 1, 60],
  ] as const;
  const reputationItems = [
    ['pill_foundation_healing', 20, 3, 10],
    ['pill_foundation_mana', 18, 3, 20],
    ['pill_foundation_cultivation', 35, 2, 30],
    ['artifact_foundation_weapon', 100, 1, 40],
    ['artifact_foundation_armor', 100, 1, 50],
    ['artifact_foundation_accessory', 120, 1, 60],
  ] as const;

  let sectCreated = 0;
  for (const [itemLibraryItemId, price, perUserLimit, sortOrder] of sectItems) {
    if (currentSectIds.has(itemLibraryItemId)) continue;
    await createSectShopItem({
      input: {
        itemLibraryItemId,
        price,
        quantity: 1,
        perUserLimit,
        status: 'active',
        sortOrder,
      },
      userId: ITEM_LIBRARY_SYSTEM_USER_ID,
    });
    sectCreated += 1;
  }

  let reputationCreated = 0;
  for (const [
    itemLibraryItemId,
    price,
    perUserLimit,
    sortOrder,
  ] of reputationItems) {
    if (currentReputationIds.has(itemLibraryItemId)) continue;
    await createReputationShopItem({
      input: {
        itemLibraryItemId,
        price,
        quantity: 1,
        perUserLimit,
        status: 'active',
        sortOrder,
      },
      userId: ITEM_LIBRARY_SYSTEM_USER_ID,
    });
    reputationCreated += 1;
  }
  return { sectCreated, reputationCreated };
}

async function main() {
  const curated = await upsertCuratedEntries(buildCuratedEntries());
  const shops = await seedShops();
  const materials = await generateDailyMarketMaterialLibraryEntries({
    count: 500,
    userId: ITEM_LIBRARY_SYSTEM_USER_ID,
    source: 'realm_baseline_seed',
    seed: 'realm_baseline_v1',
  });

  console.log(
    JSON.stringify(
      {
        curated,
        shops,
        generatedMaterials: materials.length,
      },
      null,
      2,
    ),
  );
  await db.$client.end();
}

await main();
