import { InkModal } from '@app/components/layout/InkModal';
import { InkButton, InkNotice } from '@app/components/ui';
import { useMemo, useState } from 'react';

export interface ItemSubmissionOption {
  id: string;
  title: string;
  facts: string[];
  availableQuantity: number;
  eligible: boolean;
  reasons: string[];
  warning?: string;
}

export interface ItemSubmissionSelection {
  itemId: string;
  quantity: number;
}

interface SelectedSubmission {
  option: ItemSubmissionOption;
  quantity: number;
}

export interface ItemSubmissionDialogProps {
  open: boolean;
  title: string;
  requirement: string;
  items: ItemSubmissionOption[];
  loading: boolean;
  error?: string;
  busy: boolean;
  multiple?: boolean;
  targetQuantity?: number;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange(page: number): void;
  };
  onClose(): void;
  onRetry(): void;
  onConfirm(items: ItemSubmissionSelection[]): Promise<void>;
}

export function ItemSubmissionDialog({
  open,
  title,
  requirement,
  items,
  loading,
  error,
  busy,
  multiple = false,
  targetQuantity = 1,
  pagination,
  onClose,
  onRetry,
  onConfirm,
}: ItemSubmissionDialogProps) {
  const [selected, setSelected] = useState<Record<string, SelectedSubmission>>(
    {},
  );
  const [confirming, setConfirming] = useState(false);
  const selections = useMemo(() => Object.values(selected), [selected]);
  const selectedQuantity = selections.reduce(
    (total, selection) => total + selection.quantity,
    0,
  );
  const ready = selections.length > 0 && selectedQuantity === targetQuantity;
  const close = () => {
    if (busy) return;
    setSelected({});
    setConfirming(false);
    onClose();
  };
  const changePage = (page: number) => {
    setConfirming(false);
    pagination?.onPageChange(page);
  };
  const toggle = (option: ItemSubmissionOption) => {
    if (!option.eligible || busy) return;
    setSelected((current) => {
      if (current[option.id]) {
        const next = { ...current };
        delete next[option.id];
        return next;
      }
      const currentQuantity = Object.values(current).reduce(
        (total, selection) => total + selection.quantity,
        0,
      );
      if (multiple && currentQuantity >= targetQuantity) return current;
      const quantity = multiple
        ? 1
        : Math.min(targetQuantity, option.availableQuantity);
      return multiple
        ? { ...current, [option.id]: { option, quantity } }
        : { [option.id]: { option, quantity } };
    });
  };
  const changeQuantity = (option: ItemSubmissionOption, delta: number) => {
    setSelected((current) => {
      const existing = current[option.id];
      if (!existing) return current;
      const otherQuantity = Object.values(current).reduce(
        (total, selection) =>
          selection.option.id === option.id
            ? total
            : total + selection.quantity,
        0,
      );
      const maximum = Math.min(
        option.availableQuantity,
        Math.max(1, targetQuantity - otherQuantity),
      );
      const quantity = Math.min(maximum, existing.quantity + delta);
      if (quantity <= 0) {
        const next = { ...current };
        delete next[option.id];
        return next;
      }
      return {
        ...current,
        [option.id]: { option, quantity },
      };
    });
  };
  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
    : 1;

  return (
    <InkModal
      isOpen={open}
      onClose={close}
      title={title}
      className="max-w-2xl"
      footer={
        confirming && selections.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-2">
            <InkButton disabled={busy} onClick={() => setConfirming(false)}>
              返回选择
            </InkButton>
            <InkButton
              variant="primary"
              disabled={busy}
              onClick={() =>
                void onConfirm(
                  selections.map((selection) => ({
                    itemId: selection.option.id,
                    quantity: selection.quantity,
                  })),
                )
              }
            >
              {busy ? '正在移交…' : '确认永久移交'}
            </InkButton>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <InkButton disabled={busy} onClick={close}>
              再看看
            </InkButton>
            <InkButton
              variant="primary"
              disabled={busy || !ready}
              onClick={() => setConfirming(true)}
            >
              核对交付
            </InkButton>
          </div>
        )
      }
    >
      <InkNotice>{requirement}</InkNotice>
      {multiple && !confirming ? (
        <p className="text-ink-secondary mt-3 text-sm">
          已选 {selectedQuantity} / {targetQuantity}
        </p>
      ) : null}
      {confirming && selections.length > 0 ? (
        <div className="mt-4 space-y-3 text-sm leading-7">
          <p>将向宗门移交：</p>
          <ul className="space-y-1">
            {selections.map((selection) => (
              <li key={selection.option.id}>
                <strong>{selection.option.title}</strong>
                <span className="text-ink-secondary ml-2">
                  × {selection.quantity}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-crimson">提交后物品将永久移交，无法找回。</p>
          {selections.some((selection) => selection.option.warning) ? (
            <InkNotice>
              所选物品中有品质高于委托最低要求者，奖励不会因此增加。
            </InkNotice>
          ) : null}
        </div>
      ) : loading ? (
        <p className="mt-4 text-sm text-stone-500">正在查阅背包卷宗…</p>
      ) : error ? (
        <div className="mt-4">
          <InkNotice>{error}</InkNotice>
          <InkButton className="mt-3" onClick={onRetry}>
            重新查阅
          </InkButton>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500">暂无可查阅的同类物品。</p>
      ) : (
        <>
          <div className="mt-4 grid gap-2">
            {items.map((item) => {
              const current = selected[item.id];
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 border p-3 transition-colors ${
                    current
                      ? 'border-crimson/50 bg-crimson/5'
                      : 'border-stone-800/15 bg-white/20'
                  } ${item.eligible ? 'hover:border-stone-800/35' : 'opacity-55'}`}
                >
                  <button
                    type="button"
                    disabled={!item.eligible || busy}
                    aria-pressed={Boolean(current)}
                    onClick={() => toggle(item)}
                    className={`min-w-0 flex-1 text-left ${
                      item.eligible ? 'cursor-pointer' : 'cursor-not-allowed'
                    }`}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <strong>{item.title}</strong>
                      <span className="text-xs">
                        {item.eligible
                          ? current
                            ? '已选择'
                            : '符合要求'
                          : '不可提交'}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-stone-500">
                      {item.facts.join(' · ')}
                    </span>
                    {item.reasons.length > 0 ? (
                      <span className="text-crimson mt-1 block text-xs leading-5">
                        {item.reasons.join('；')}
                      </span>
                    ) : null}
                  </button>
                  {multiple && current ? (
                    <div
                      className="flex shrink-0 items-center gap-2"
                      aria-label={`${item.title}提交数量`}
                    >
                      <InkButton
                        disabled={busy}
                        aria-label={`减少${item.title}数量`}
                        onClick={() => changeQuantity(item, -1)}
                      >
                        −
                      </InkButton>
                      <span className="w-5 text-center text-sm">
                        {current.quantity}
                      </span>
                      <InkButton
                        disabled={
                          busy ||
                          current.quantity >= item.availableQuantity ||
                          selectedQuantity >= targetQuantity
                        }
                        aria-label={`增加${item.title}数量`}
                        onClick={() => changeQuantity(item, 1)}
                      >
                        ＋
                      </InkButton>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {pagination && totalPages > 1 ? (
            <nav
              aria-label="交付候选分页"
              className="mt-4 flex items-center justify-between gap-3 text-sm"
            >
              <InkButton
                disabled={busy || loading || pagination.page <= 1}
                onClick={() => changePage(pagination.page - 1)}
              >
                上一页
              </InkButton>
              <span className="text-stone-500">
                第 {pagination.page} / {totalPages} 页，共 {pagination.total} 件
              </span>
              <InkButton
                disabled={busy || loading || pagination.page >= totalPages}
                onClick={() => changePage(pagination.page + 1)}
              >
                下一页
              </InkButton>
            </nav>
          ) : null}
        </>
      )}
    </InkModal>
  );
}
