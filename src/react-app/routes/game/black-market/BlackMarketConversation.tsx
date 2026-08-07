import { NpcConversation } from '@app/components/feature/room';
import {
  InkButton,
  InkDialog,
  type InkDialogState,
  InkNotice,
} from '@app/components/ui';
import { getGameConceptInfo } from '@shared/lib/gameConceptDisplay';
import type {
  BlackMarketInspectionKind,
  BlackMarketNpcSummary,
  BlackMarketSessionView,
} from '@shared/types/blackMarket';
import { useMemo, useState } from 'react';

const SPIRIT_STONES = getGameConceptInfo('spirit_stones');

const inspectionOptions: Array<{
  kind: BlackMarketInspectionKind;
  label: string;
}> = [
  { kind: 'appearance', label: '观察外观' },
  { kind: 'aura', label: '感知灵气' },
  { kind: 'damage', label: '检查破损' },
  { kind: 'origin', label: '询问来历' },
  { kind: 'sale_reason', label: '询问为何出售' },
];

export function BlackMarketConversation({
  npc,
  session,
  busy,
  error,
  notice,
  onInspect,
  onQuestion,
  onHaggle,
  onCommit,
  onLeave,
}: {
  npc: BlackMarketNpcSummary;
  session: BlackMarketSessionView;
  busy: boolean;
  error?: string;
  notice?: string;
  onInspect(kind: BlackMarketInspectionKind): void;
  onQuestion(message: string): void;
  onHaggle(message: string, offeredPrice: number): void;
  onCommit(): Promise<void>;
  onLeave(): void;
}) {
  const [question, setQuestion] = useState('');
  const [haggleMessage, setHaggleMessage] = useState('');
  const [offeredPrice, setOfferedPrice] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<InkDialogState | null>(
    null,
  );
  const revealedKinds = useMemo(
    () => new Set(session.revealedClues.map((clue) => clue.kind)),
    [session.revealedClues],
  );
  const inspectExhausted = session.inspectTurnsUsed >= session.inspectTurnsMax;
  const haggleExhausted = session.haggleTurnsUsed >= session.haggleTurnsMax;

  const messages = session.messages.map((message) => ({
    id: message.id,
    speaker: message.role === 'npc' ? npc.name : undefined,
    body: message.role === 'player' ? `你：${message.body}` : message.body,
    tone:
      message.role === 'player'
        ? ('muted' as const)
        : message.role === 'system'
          ? ('attention' as const)
          : ('normal' as const),
  }));

  const confirmPurchase = () => {
    setConfirmDialog({
      id: `black-market-buy-${session.id}`,
      title: '暗巷成交',
      content: (
        <div className="space-y-3 text-sm leading-7">
          <p>
            以当前报价买下「{session.listing.disguisedName}
            」？成交后将当场揭晓真品。
          </p>
          <p className="text-gold font-semibold">
            将消耗：{SPIRIT_STONES.icon} {session.currentPrice.toLocaleString()}{' '}
            {SPIRIT_STONES.label}
          </p>
          <p className="text-ink-secondary">暗巷交易落子无悔。</p>
        </div>
      ),
      confirmLabel: '成交开奖',
      cancelLabel: '再想想',
      onConfirm: async () => {
        await onCommit();
      },
    });
  };

  return (
    <>
      <NpcConversation
        actor={npc}
        messages={messages}
        busy={busy}
        error={error}
        actions={
          <>
            {inspectionOptions.map((option) => (
              <InkButton
                key={option.kind}
                onClick={() => onInspect(option.kind)}
                disabled={
                  busy || inspectExhausted || revealedKinds.has(option.kind)
                }
              >
                {option.label}
              </InkButton>
            ))}
          </>
        }
      >
        <div className="space-y-5">
          <div className="border-ink/15 flex flex-wrap items-center justify-between gap-3 border-y py-3 text-sm">
            <span>{session.listing.disguisedName}</span>
            <strong className="text-gold">
              当前报价：{session.currentPrice.toLocaleString()} 灵石
            </strong>
            <span className="text-ink-secondary">
              查验 {session.inspectTurnsUsed}/{session.inspectTurnsMax} · 议价{' '}
              {session.haggleTurnsUsed}/{session.haggleTurnsMax}
            </span>
          </div>
          <p className="text-ink-secondary text-sm leading-7">
            {session.listing.description}
          </p>
          {notice ? <InkNotice>{notice}</InkNotice> : null}

          {!inspectExhausted ? (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!question.trim()) return;
                onQuestion(question.trim());
                setQuestion('');
              }}
            >
              <label
                className="text-ink-secondary block text-sm"
                htmlFor="black-market-question"
              >
                自由提问（计一次查验）
              </label>
              <div className="flex gap-2">
                <input
                  id="black-market-question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  maxLength={240}
                  disabled={busy}
                  className="border-ink/20 bg-paper/40 focus:border-crimson/45 min-w-0 flex-1 border px-3 py-2 outline-none"
                  placeholder="例如：这股寒意是伪造的吗？"
                />
                <InkButton type="submit" disabled={busy || !question.trim()}>
                  询问
                </InkButton>
              </div>
            </form>
          ) : null}

          {!haggleExhausted ? (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                const price = Number(offeredPrice);
                if (
                  !haggleMessage.trim() ||
                  !Number.isSafeInteger(price) ||
                  price < 1
                )
                  return;
                onHaggle(haggleMessage.trim(), price);
                setHaggleMessage('');
                setOfferedPrice('');
              }}
            >
              <label
                className="text-ink-secondary block text-sm"
                htmlFor="black-market-haggle"
              >
                正式议价
              </label>
              <textarea
                id="black-market-haggle"
                value={haggleMessage}
                onChange={(event) => setHaggleMessage(event.target.value)}
                maxLength={240}
                disabled={busy}
                rows={2}
                className="border-ink/20 bg-paper/40 focus:border-crimson/45 w-full resize-none border px-3 py-2 outline-none"
                placeholder="引用查到的线索，说出你的价钱……"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={2_000_000_000}
                  value={offeredPrice}
                  onChange={(event) => setOfferedPrice(event.target.value)}
                  disabled={busy}
                  className="border-ink/20 bg-paper/40 focus:border-crimson/45 min-w-0 flex-1 border px-3 py-2 outline-none"
                  placeholder="报价灵石"
                />
                <InkButton
                  type="submit"
                  disabled={busy || !haggleMessage.trim() || !offeredPrice}
                  variant="primary"
                >
                  出价
                </InkButton>
              </div>
            </form>
          ) : (
            <p className="text-ink-secondary text-sm">摊主已经不愿继续议价。</p>
          )}

          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <InkButton onClick={onLeave} disabled={busy} variant="secondary">
              离开摊位
            </InkButton>
            <InkButton
              onClick={confirmPurchase}
              disabled={busy}
              variant="primary"
            >
              按当前价格成交
            </InkButton>
          </div>
        </div>
      </NpcConversation>
      <InkDialog
        dialog={confirmDialog}
        onClose={() => setConfirmDialog(null)}
      />
    </>
  );
}
