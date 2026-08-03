import { InkModal } from '@app/components/layout/InkModal';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton } from '@app/components/ui/InkButton';
import { InkInput } from '@app/components/ui/InkInput';
import type { BattleRecordUnitSummary } from '@shared/types/battle';
import { useState } from 'react';

export interface BattleShareSummary {
  winner: BattleRecordUnitSummary;
  loser: BattleRecordUnitSummary;
  turns: number;
}

interface BattleShareDialogProps {
  isOpen: boolean;
  battleRecordId: string;
  summary: BattleShareSummary;
  onClose: () => void;
}

type ShareAction = 'copy' | 'world' | 'sect';

type ShareResponse = {
  success: boolean;
  data?: {
    shareCode: string;
    sharePath: string;
    created: boolean;
  };
  error?: string;
};

export function BattleShareDialog({
  isOpen,
  battleRecordId,
  summary,
  onClose,
}: BattleShareDialogProps) {
  const { pushToast } = useInkUI();
  const [caption, setCaption] = useState('');
  const [pendingAction, setPendingAction] = useState<ShareAction | null>(null);
  const captionLength = Array.from(caption).length;
  const captionTooLong = captionLength > 100;

  const close = () => {
    if (pendingAction) return;
    setCaption('');
    onClose();
  };

  const copyShareLink = async () => {
    setPendingAction('copy');
    try {
      const response = await fetch(
        `/api/battle-records/v3/${battleRecordId}/share`,
        { method: 'POST' },
      );
      const payload = (await response.json()) as ShareResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || '生成分享链接失败');
      }
      const shareUrl = new URL(
        payload.data.sharePath,
        window.location.origin,
      ).toString();
      await navigator.clipboard.writeText(shareUrl);
      pushToast({ message: '战谱链接已复制', tone: 'success' });
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '复制链接失败',
        tone: 'danger',
      });
    } finally {
      setPendingAction(null);
    }
  };

  const sendToChannel = async (channel: 'world' | 'sect') => {
    if (captionTooLong) return;
    setPendingAction(channel);
    try {
      const endpoint =
        channel === 'sect'
          ? '/api/sects/current/chat/messages'
          : '/api/world-chat/messages';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageType: 'battle_showcase',
          battleRecordId,
          ...(caption.trim() ? { textContent: caption.trim() } : {}),
        }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || '展示战谱失败');
      }
      pushToast({
        message: channel === 'sect' ? '已展示到宗门传音' : '已展示到世界传音',
        tone: 'success',
      });
      setCaption('');
      onClose();
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '展示战谱失败',
        tone: 'danger',
      });
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <InkModal
      isOpen={isOpen}
      onClose={close}
      title="展示战谱"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
          <InkButton
            onClick={() => void copyShareLink()}
            pending={pendingAction === 'copy'}
            disabled={pendingAction !== null && pendingAction !== 'copy'}
          >
            复制链接
          </InkButton>
          <InkButton
            onClick={() => void sendToChannel('world')}
            pending={pendingAction === 'world'}
            disabled={captionTooLong || pendingAction !== null}
          >
            世界传音
          </InkButton>
          <InkButton
            variant="primary"
            onClick={() => void sendToChannel('sect')}
            pending={pendingAction === 'sect'}
            disabled={captionTooLong || pendingAction !== null}
          >
            宗门传音
          </InkButton>
        </div>
      }
    >
      <div className="space-y-4 text-sm leading-7">
        <div className="border-ink/10 flex items-center gap-2 border-y border-dashed py-2">
          <span className="text-teal min-w-0 flex-1 truncate font-semibold">
            {summary.winner.name}
          </span>
          <span className="text-ink-secondary shrink-0">
            胜 · {summary.turns} 回
          </span>
          <span className="text-crimson min-w-0 flex-1 truncate text-right">
            {summary.loser.name}
          </span>
        </div>
        <p className="text-crimson">
          战谱一经公开将永久有效，且无法撤销；精确属性不会公开。
        </p>
        <InkInput
          multiline
          rows={3}
          label="附言（可选）"
          placeholder="说说这场斗法的精彩之处……"
          value={caption}
          onChange={setCaption}
          hint={`${captionLength}/100`}
          error={captionTooLong ? '附言长度需在 100 字以内' : undefined}
          disabled={pendingAction !== null}
        />
      </div>
    </InkModal>
  );
}
