import { ItemShowcaseModal } from '@app/components/ui/ItemShowcaseModal';
import { InkBadge } from '@app/components/ui/InkBadge';
import {
  getTowerBlessingDefinition,
  getTowerBlessingEffectPreview,
  type TowerBlessingId,
} from '@shared/lib/tower';

const BLESSING_ICONS: Record<TowerBlessingId, string> = {
  vitality_surge: '🩸',
  spirit_surge: '🌊',
  swift_step: '🪽',
  mind_focus: '🕯️',
  jade_bones: '🦴',
  sea_of_qi: '🌌',
  breathing_technique: '🍃',
  meridian_cycle: '🫧',
  balanced_dao: '☯️',
};

interface TowerBlessingDetailModalProps {
  blessingId: TowerBlessingId | null;
  isOpen: boolean;
  onClose: () => void;
  currentStacks: number;
  nextStacks?: number;
  currentHp?: number;
  maxHp?: number;
  currentMp?: number;
  maxMp?: number;
}

export function TowerBlessingDetailModal({
  blessingId,
  isOpen,
  onClose,
  currentStacks,
  nextStacks,
  currentHp,
  maxHp,
  currentMp,
  maxMp,
}: TowerBlessingDetailModalProps) {
  if (!blessingId) {
    return null;
  }

  const definition = getTowerBlessingDefinition(blessingId);
  const preview = getTowerBlessingEffectPreview({
    blessingId,
    currentStacks,
    nextStacks,
    currentHp,
    maxHp,
    currentMp,
    maxMp,
  });

  return (
    <ItemShowcaseModal
      isOpen={isOpen}
      onClose={onClose}
      icon={BLESSING_ICONS[blessingId]}
      name={definition.name}
      badges={[
        <InkBadge key="current" tone="accent">
          {`当前 ${currentStacks}/${definition.maxStacks} 层`}
        </InkBadge>,
        nextStacks != null ? (
          <InkBadge key="next" tone="default">
            {`选后 ${nextStacks}/${definition.maxStacks} 层`}
          </InkBadge>
        ) : (
          <InkBadge key="max" tone="default">
            {`上限 ${definition.maxStacks} 层`}
          </InkBadge>
        ),
      ]}
      summary={
        <div className="space-y-1 text-sm leading-7">
          <p>{preview.currentLabel}</p>
          {preview.nextLabel ? <p>选后：{preview.nextLabel}</p> : null}
          <p className="text-ink-secondary">{preview.formulaLabel}</p>
        </div>
      }
      description={definition.description}
    />
  );
}
