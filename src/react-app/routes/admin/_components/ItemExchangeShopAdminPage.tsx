import { useInkUI } from '@app/components/providers/InkUIProvider';
import {
  InkBadge,
  InkButton,
  InkInput,
  InkList,
  InkListItem,
  InkNotice,
  InkSelect,
} from '@app/components/ui';
import {
  ITEM_EXCHANGE_SHOP_MAX_PRICE,
  ITEM_EXCHANGE_SHOP_MAX_STACK_QUANTITY,
  type ItemExchangeShopItemMutation,
  type ItemExchangeShopItemView,
} from '@shared/contracts/itemExchangeShop';
import type { ItemLibraryEntry } from '@shared/lib/itemLibrary';
import { QUALITY_VALUES, type Quality } from '@shared/types/constants';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ItemLibraryPicker } from './ItemLibraryPicker';

interface DraftState {
  id: string | null;
  itemLibraryItemId: string;
  price: string;
  quantity: string;
  perUserLimit: string;
  status: 'active' | 'archived';
  sortOrder: string;
}

const emptyDraft: DraftState = {
  id: null,
  itemLibraryItemId: '',
  price: '1000',
  quantity: '1',
  perUserLimit: '',
  status: 'active',
  sortOrder: '0',
};

function parsePositiveInt(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label}必须为正整数`);
  }
  return parsed;
}

function normalizeQuantity(
  quantity: string,
  item: ItemLibraryEntry | undefined,
) {
  return item?.type === 'artifact' ? '1' : quantity;
}

function toMutation(
  draft: DraftState,
  item: ItemLibraryEntry | undefined,
): ItemExchangeShopItemMutation {
  const price = parsePositiveInt(draft.price, '价格');
  if (price > ITEM_EXCHANGE_SHOP_MAX_PRICE) {
    throw new Error(`价格最高为 ${ITEM_EXCHANGE_SHOP_MAX_PRICE}`);
  }
  const quantity = parsePositiveInt(
    normalizeQuantity(draft.quantity, item),
    '数量',
  );
  if (item?.type === 'artifact' && quantity !== 1) {
    throw new Error('法宝类商品每次只能发放 1 件');
  }
  if (
    item?.type !== 'artifact' &&
    quantity > ITEM_EXCHANGE_SHOP_MAX_STACK_QUANTITY
  ) {
    throw new Error(
      `材料和消耗品每次最多发放 ${ITEM_EXCHANGE_SHOP_MAX_STACK_QUANTITY} 件`,
    );
  }
  return {
    itemLibraryItemId: draft.itemLibraryItemId,
    price,
    quantity,
    perUserLimit: draft.perUserLimit.trim()
      ? parsePositiveInt(draft.perUserLimit, '每周限购')
      : null,
    status: draft.status,
    sortOrder: Number.isInteger(Number(draft.sortOrder))
      ? Number(draft.sortOrder)
      : 0,
  };
}

function qualityTier(quality: string | null | undefined): Quality | undefined {
  return QUALITY_VALUES.includes(quality as Quality)
    ? (quality as Quality)
    : undefined;
}

export interface ItemExchangeShopAdminPageProps {
  endpoint: string;
  eyebrow: string;
  title: string;
  priceLabel: string;
  currencyLabel: string;
  emptyText: string;
  successText: string;
}

export function ItemExchangeShopAdminPage({
  endpoint,
  eyebrow,
  title,
  priceLabel,
  currencyLabel,
  emptyText,
  successText,
}: ItemExchangeShopAdminPageProps) {
  const { pushToast } = useInkUI();
  const [items, setItems] = useState<ItemExchangeShopItemView[]>([]);
  const [libraryItems, setLibraryItems] = useState<ItemLibraryEntry[]>([]);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const libraryById = useMemo(
    () => new Map(libraryItems.map((item) => [item.itemId, item])),
    [libraryItems],
  );
  const selectedItem = libraryById.get(draft.itemLibraryItemId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      const data = (await response.json()) as {
        items?: ItemExchangeShopItemView[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? '加载商店失败');
      const nextItems = data.items ?? [];
      setItems(nextItems);
      setLibraryItems((current) => {
        const byId = new Map(current.map((item) => [item.itemId, item]));
        nextItems.forEach((item) => byId.set(item.item.itemId, item.item));
        return Array.from(byId.values());
      });
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '加载失败',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [endpoint, pushToast]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const reset = () => setDraft({ ...emptyDraft });
  const edit = (item: ItemExchangeShopItemView) => {
    setLibraryItems((current) =>
      current.some((entry) => entry.itemId === item.item.itemId)
        ? current
        : [...current, item.item],
    );
    setDraft({
      id: item.id,
      itemLibraryItemId: item.itemLibraryItemId,
      price: String(item.price),
      quantity: normalizeQuantity(String(item.quantity), item.item),
      perUserLimit: item.perUserLimit ? String(item.perUserLimit) : '',
      status: item.status,
      sortOrder: String(item.sortOrder),
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(
        draft.id ? `${endpoint}/${draft.id}` : endpoint,
        {
          method: draft.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toMutation(draft, selectedItem)),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? '保存失败');
      pushToast({ message: successText, tone: 'success' });
      reset();
      await load();
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '保存失败',
        tone: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  const archive = async (item: ItemExchangeShopItemView) => {
    const response = await fetch(`${endpoint}/${item.id}/archive`, {
      method: 'POST',
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      pushToast({ message: data.error ?? '下架失败', tone: 'danger' });
      return;
    }
    pushToast({ message: '商品已下架', tone: 'success' });
    await load();
  };

  return (
    <div className="space-y-5">
      <header className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <p className="text-ink-secondary text-xs tracking-[0.2em]">
          {eyebrow}
        </p>
        <h2 className="font-heading text-ink mt-2 text-4xl">{title}</h2>
      </header>

      <section className="border-ink/15 bg-bgpaper/90 space-y-4 border border-dashed p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <ItemLibraryPicker
            label="道具库道具"
            value={draft.itemLibraryItemId}
            onChange={(itemLibraryItemId, item) => {
              if (item) {
                setLibraryItems((current) =>
                  current.some((entry) => entry.itemId === item.itemId)
                    ? current
                    : [...current, item],
                );
              }
              setDraft((current) => ({
                ...current,
                itemLibraryItemId,
                quantity: normalizeQuantity(current.quantity, item),
              }));
            }}
          />
          <InkInput
            label={priceLabel}
            value={draft.price}
            onChange={(price) => setDraft((current) => ({ ...current, price }))}
            hint={`最高 ${ITEM_EXCHANGE_SHOP_MAX_PRICE}`}
          />
          <InkInput
            label="单次获得"
            value={normalizeQuantity(draft.quantity, selectedItem)}
            onChange={(quantity) =>
              setDraft((current) => ({ ...current, quantity }))
            }
            disabled={selectedItem?.type === 'artifact'}
            hint={
              selectedItem?.type === 'artifact'
                ? '法宝固定发放 1 件'
                : `材料/消耗品最高 ${ITEM_EXCHANGE_SHOP_MAX_STACK_QUANTITY} 件`
            }
          />
          <InkInput
            label="每周限购"
            value={draft.perUserLimit}
            onChange={(perUserLimit) =>
              setDraft((current) => ({ ...current, perUserLimit }))
            }
            placeholder="留空表示不限"
          />
          <InkInput
            label="排序"
            value={draft.sortOrder}
            onChange={(sortOrder) =>
              setDraft((current) => ({ ...current, sortOrder }))
            }
          />
          <InkSelect
            label="状态"
            value={draft.status}
            onChange={(status) =>
              setDraft((current) => ({
                ...current,
                status: status as DraftState['status'],
              }))
            }
          >
            <option value="active">上架</option>
            <option value="archived">下架</option>
          </InkSelect>
        </div>

        {draft.itemLibraryItemId ? (
          <InkNotice tone="muted">
            当前选择：
            {libraryById.get(draft.itemLibraryItemId)?.name ??
              draft.itemLibraryItemId}
          </InkNotice>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <InkButton
            type="button"
            variant="primary"
            onClick={save}
            disabled={saving || !draft.itemLibraryItemId}
          >
            {draft.id ? '保存修改' : '新增商品'}
          </InkButton>
          <InkButton type="button" variant="secondary" onClick={reset}>
            清空表单
          </InkButton>
        </div>
      </section>

      <section className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        {loading ? (
          <InkNotice tone="muted">商品加载中...</InkNotice>
        ) : items.length === 0 ? (
          <InkNotice tone="muted">{emptyText}</InkNotice>
        ) : (
          <InkList>
            {items.map((item) => (
              <InkListItem
                key={item.id}
                title={
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{item.item.name}</span>
                    <InkBadge tier={qualityTier(item.item.quality)}>
                      {item.status === 'active' ? '上架' : '下架'}
                    </InkBadge>
                  </div>
                }
                meta={`价格 ${item.price} ${currencyLabel} · 单次获得 ${item.quantity} · 每周限购 ${
                  item.perUserLimit ?? '不限'
                } · 排序 ${item.sortOrder}`}
                description={
                  item.item.description ?? item.item.payload.description
                }
                actions={
                  <div className="flex gap-2">
                    <InkButton
                      type="button"
                      variant="secondary"
                      onClick={() => edit(item)}
                    >
                      编辑
                    </InkButton>
                    <InkButton
                      type="button"
                      variant="secondary"
                      onClick={() => archive(item)}
                      disabled={item.status === 'archived'}
                    >
                      下架
                    </InkButton>
                  </div>
                }
              />
            ))}
          </InkList>
        )}
      </section>
    </div>
  );
}
