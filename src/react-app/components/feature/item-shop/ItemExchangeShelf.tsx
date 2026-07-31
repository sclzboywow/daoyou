import { ConsumableListCard } from '@app/components/feature/consumables';
import {
  ItemDetailModal,
  toInventoryItemDetail,
  type ItemDetailPayload,
} from '@app/components/feature/items';
import { ArtifactListCard } from '@app/components/feature/products';
import { GameSceneTabs } from '@app/components/game-shell';
import { InkBadge, InkButton, InkList, InkNotice } from '@app/components/ui';
import { ItemCard } from '@app/components/ui/ItemCard';
import {
  useCultivatorCondition,
  useCultivatorIdentity,
} from '@app/lib/resources/player';
import type { ItemExchangeShopItemView } from '@shared/contracts/itemExchangeShop';
import {
  getGameConceptInfo,
  getMaterialTypeInfo,
} from '@shared/lib/gameConceptDisplay';
import type { Artifact, Consumable, Material } from '@shared/types/cultivator';
import { QUALITY_VALUES, type Quality } from '@shared/types/constants';
import { useMemo, useState } from 'react';

type ShopTabKey = 'artifact' | 'pill' | 'talisman' | 'material';

const SHOP_TABS: Array<{
  key: ShopTabKey;
  title: string;
  emptyText: string;
}> = [
  { key: 'artifact', title: '法宝', emptyText: '暂无可兑换法宝。' },
  { key: 'pill', title: '丹药', emptyText: '暂无可兑换丹药。' },
  { key: 'talisman', title: '符箓', emptyText: '暂无可兑换符箓。' },
  { key: 'material', title: '灵材', emptyText: '暂无可兑换灵材。' },
];

function toQualityTier(quality: string | null | undefined): Quality | undefined {
  return QUALITY_VALUES.includes(quality as Quality)
    ? (quality as Quality)
    : undefined;
}

function getShopTabKey(item: ItemExchangeShopItemView): ShopTabKey {
  if (item.item.type === 'artifact') return 'artifact';
  if (item.item.type === 'material') return 'material';
  return item.item.payload.type === '符箓' ? 'talisman' : 'pill';
}

function toInventoryPreviewItem(
  shopItem: ItemExchangeShopItemView,
): Artifact | Material | Consumable {
  const entry = shopItem.item;
  if (entry.type === 'artifact') {
    return {
      id: entry.itemId,
      name: entry.payload.name,
      slot: entry.payload.slot,
      element: entry.payload.element,
      quality: entry.payload.quality,
      description: entry.payload.description,
      score: entry.payload.score,
      productModel: entry.payload.productModel,
    };
  }
  if (entry.type === 'consumable') {
    return {
      id: entry.itemId,
      name: entry.payload.name,
      type: entry.payload.type,
      quality: entry.payload.quality,
      quantity: shopItem.quantity,
      description: entry.payload.description,
      prompt: entry.payload.prompt,
      score: entry.payload.score,
      spec: entry.payload.spec as Consumable['spec'],
    };
  }
  return {
    id: entry.itemId,
    name: entry.payload.name,
    type: entry.payload.type,
    rank: entry.payload.rank,
    element: entry.payload.element,
    description: entry.payload.description,
    quantity: shopItem.quantity,
  };
}

function toDetailPayload(
  shopItem: ItemExchangeShopItemView,
): ItemDetailPayload {
  const preview = toInventoryPreviewItem(shopItem);
  if (shopItem.item.type === 'artifact') {
    return toInventoryItemDetail('artifact', preview as Artifact);
  }
  if (shopItem.item.type === 'consumable') {
    return toInventoryItemDetail('consumable', preview as Consumable);
  }
  return toInventoryItemDetail('material', preview as Material);
}

export interface ItemExchangeShelfProps {
  items: ItemExchangeShopItemView[];
  balance: number | undefined;
  currencyConcept: 'reputation' | 'contribution';
  buyingId: string | null;
  onBuy: (item: ItemExchangeShopItemView) => void;
  loading?: boolean;
  loadingText: string;
  emptyText: string;
}

export function ItemExchangeShelf({
  items,
  balance,
  currencyConcept,
  buyingId,
  onBuy,
  loading = false,
  loadingText,
  emptyText,
}: ItemExchangeShelfProps) {
  const profile = useCultivatorIdentity();
  const condition = useCultivatorCondition();
  const currencyInfo = getGameConceptInfo(currencyConcept);
  const [detailItem, setDetailItem] = useState<ItemDetailPayload | null>(null);
  const [activeTab, setActiveTab] = useState<ShopTabKey>('artifact');
  const counts = useMemo(
    () =>
      items.reduce<Record<ShopTabKey, number>>(
        (result, item) => {
          result[getShopTabKey(item)] += 1;
          return result;
        },
        { artifact: 0, pill: 0, talisman: 0, material: 0 },
      ),
    [items],
  );
  const visibleTabs = useMemo(
    () => SHOP_TABS.filter((tab) => counts[tab.key] > 0),
    [counts],
  );
  const selectedTab =
    counts[activeTab] > 0 ? activeTab : visibleTabs[0]?.key;
  const activeItems = selectedTab
    ? items.filter((item) => getShopTabKey(item) === selectedTab)
    : [];
  const selectedMeta =
    SHOP_TABS.find((tab) => tab.key === selectedTab) ?? SHOP_TABS[0];
  const cultivator = profile.data?.cultivator;

  const purchaseMeta = (item: ItemExchangeShopItemView) => {
    const remaining =
      item.remainingPurchases === null ? '不限' : item.remainingPurchases;
    const limit = item.perUserLimit === null ? '不限' : item.perUserLimit;
    return `${currencyInfo.icon} ${item.price} ${currencyInfo.label} · 本周剩余 ${remaining}/${limit}`;
  };

  const actions = (item: ItemExchangeShopItemView) => {
    const canBuy =
      item.remainingPurchases !== 0 &&
      balance !== undefined &&
      balance >= item.price &&
      buyingId !== item.id;
    return (
      <div className="flex w-full flex-wrap justify-end gap-2">
        <InkButton
          type="button"
          variant="secondary"
          onClick={() => setDetailItem(toDetailPayload(item))}
        >
          详情
        </InkButton>
        <InkButton
          type="button"
          onClick={() => onBuy(item)}
          disabled={!canBuy}
          variant={canBuy ? 'primary' : 'secondary'}
        >
          {buyingId === item.id
            ? '兑换中'
            : item.remainingPurchases === 0
              ? '本周已罄'
              : balance === undefined
                ? `${currencyInfo.label}读取中`
                : balance < item.price
                  ? `${currencyInfo.label}不足`
                  : '兑换'}
        </InkButton>
      </div>
    );
  };

  const renderItem = (item: ItemExchangeShopItemView) => {
    const preview = toInventoryPreviewItem(item);
    if (item.item.type === 'artifact') {
      return (
        <ArtifactListCard
          key={item.id}
          artifact={preview as Artifact}
          actions={actions(item)}
        />
      );
    }
    if (item.item.type === 'consumable') {
      const consumable = preview as Consumable;
      return (
        <ConsumableListCard
          key={item.id}
          consumable={{
            ...consumable,
            quality: toQualityTier(consumable.quality),
          }}
          realm={cultivator?.realm}
          condition={condition.data}
          contextMeta={<div>{purchaseMeta(item)}</div>}
          contextMetaPlacement="before"
          actions={actions(item)}
        />
      );
    }
    const material = preview as Material;
    const typeInfo = getMaterialTypeInfo(material.type);
    return (
      <ItemCard
        key={item.id}
        layout="col"
        icon={typeInfo.icon}
        name={material.name}
        quality={material.rank}
        badgeExtra={
          <>
            <InkBadge tier={material.rank}>{typeInfo.label}</InkBadge>
            {material.element ? (
              <InkBadge tone="default">{material.element}</InkBadge>
            ) : null}
            {item.quantity > 1 ? (
              <span className="text-ink-secondary text-sm">x{item.quantity}</span>
            ) : null}
          </>
        }
        meta={purchaseMeta(item)}
        description={
          material.element
            ? `${material.element}属性${typeInfo.label}`
            : `${typeInfo.label}，可入炼制之用`
        }
        actions={actions(item)}
      />
    );
  };

  if (loading) return <InkNotice tone="muted">{loadingText}</InkNotice>;
  if (items.length === 0) return <InkNotice tone="muted">{emptyText}</InkNotice>;

  return (
    <>
      <div className="space-y-4">
        <GameSceneTabs
          activeValue={selectedTab ?? visibleTabs[0].key}
          onChange={(value) => setActiveTab(value as ShopTabKey)}
          items={visibleTabs.map((tab) => ({
            value: tab.key,
            label: `${tab.title} ${counts[tab.key]}`,
          }))}
        />
        {activeItems.length > 0 ? (
          <InkList>{activeItems.map(renderItem)}</InkList>
        ) : (
          <InkNotice tone="muted">{selectedMeta.emptyText}</InkNotice>
        )}
      </div>
      <ItemDetailModal
        isOpen={Boolean(detailItem)}
        item={detailItem}
        onClose={() => setDetailItem(null)}
        viewerRealm={cultivator?.realm}
        viewerCondition={condition.data}
      />
    </>
  );
}
