import {
  matchesInventoryFilters,
  type InventoryKind,
} from '@app/components/feature/items/inventoryFilterModel';
import { InkButton } from '@app/components/ui/InkButton';
import { CraftInventoryPanel } from '../items/CraftInventoryPanel';
import { InventoryItems } from '../items/InventoryItems';
import type { ForgeItem, ForgingSession } from './useForgingSession';

export type ForgeFilter = InventoryKind;
export function ForgingInventory({
  session,
  filter,
  onFilter,
  selected,
  onChoose,
  fixedFilter = false,
}: {
  session: ForgingSession;
  filter: ForgeFilter;
  onFilter: (filter: ForgeFilter) => void;
  selected?: string;
  onChoose: (item: ForgeItem) => void;
  fixedFilter?: boolean;
}) {
  const search = session.storage.search;
  return (
    <CraftInventoryPanel
      source={session.source}
      onSource={session.setSource}
      view={session.inventory}
      loading={session.inventoryLoading}
      error={session.source === 'storage' ? session.storage.error : ''}
      search={search}
      kind={fixedFilter ? 'blueprint' : filter}
      kindDisabled={fixedFilter}
      onSearch={session.storage.setSearch}
      onKind={(value) => {
        onFilter(value);
        session.storage.setPage(0);
      }}
      onPage={session.storage.setPage}
      onReload={session.reloadInventory}
    >
      <p className="text-ink-secondary text-xs">
        已备{' '}
        <span className="font-mono">
          {session.total} / {session.cost?.quantity ?? 0}
        </span>
      </p>
      <InventoryItems
        items={
          session.source === 'storage' ||
          (!fixedFilter && filter === 'all' && !search)
            ? (session.inventory?.items ?? [])
            : (session.inventory?.items ?? []).filter((item) =>
                matchesInventoryFilters(
                  item,
                  search,
                  fixedFilter ? 'blueprint' : filter,
                ),
              )
        }
        location={session.source}
        quickTouchHint
        compact={
          session.source === 'bag' &&
          (filter !== 'all' || !!search || fixedFilter)
        }
        slotProps={(item) => {
          const used =
            item && !session.result
              ? (session.quantities.get(item.id) ?? 0) +
                Number(session.blueprint?.id === item.id)
              : 0;
          const problem = item ? session.itemProblem(item) : null;
          return {
            guideAnchor:
              fixedFilter &&
              session.source === 'bag' &&
              item?.definitionId === 'blueprint.weapon.10'
                ? 'forge.blueprint'
                : undefined,
            selected: !!item && selected === item.id,
            disabled: session.locked || !!problem,
            quickOnTouch: true,
            badge: used ? `已投${used}` : item && !problem ? '可选' : undefined,
            onQuickAction: item ? () => onChoose(item) : undefined,
            children: item
              ? (close) => (
                  <>
                    {problem ? (
                      <p className="text-ink-secondary">{problem}</p>
                    ) : null}
                    <InkButton
                      disabled={session.locked || !!problem}
                      onClick={() => {
                        onChoose(item);
                        close();
                      }}
                    >
                      放入器炉
                    </InkButton>
                  </>
                )
              : undefined,
          };
        }}
      />
    </CraftInventoryPanel>
  );
}
