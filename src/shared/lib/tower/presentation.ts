import { getTowerBlessingDefinition, type TowerBlessingId } from './blessings';

export interface TowerBlessingEffectPreview {
  currentLabel: string;
  nextLabel?: string;
  formulaLabel: string;
}

export interface TowerBlessingEffectPreviewArgs {
  blessingId: TowerBlessingId;
  currentStacks: number;
  nextStacks?: number;
  maxHp?: number;
  currentHp?: number;
  maxMp?: number;
  currentMp?: number;
}

function clampStacks(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatRecoveryAmount(args: {
  ratio: number;
  current: number | undefined;
  max: number | undefined;
}) {
  const current = args.current ?? NaN;
  const max = args.max ?? NaN;
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= current) {
    return null;
  }

  return Math.floor((max - current) * args.ratio);
}

function describeStackValue(
  blessingId: TowerBlessingId,
  stacks: number,
  args: TowerBlessingEffectPreviewArgs,
) {
  if (stacks <= 0) {
    return '尚未承接';
  }

  switch (blessingId) {
    case 'vitality_surge':
      return `体魄 +${stacks * 8}%`;
    case 'spirit_surge':
      return `灵力 +${stacks * 8}%`;
    case 'swift_step':
      return `身法 +${stacks * 8}%`;
    case 'mind_focus':
      return `悟性、神识 +${stacks * 6}%`;
    case 'jade_bones':
      return `最大气血 +${stacks * 10}%`;
    case 'sea_of_qi':
      return `最大法力 +${stacks * 12}%`;
    case 'balanced_dao':
      return `五维主属性 +${stacks * 5}%`;
    case 'breathing_technique': {
      const ratio = 0.1 * stacks;
      const recovered = formatRecoveryAmount({
        ratio,
        current: args.currentHp,
        max: args.maxHp,
      });
      return recovered === null
        ? `战前回复 ${formatPercent(ratio)} 缺失气血`
        : `战前回复 ${formatPercent(ratio)} 缺失气血（约 ${recovered} 点）`;
    }
    case 'meridian_cycle': {
      const ratio = 0.15 * stacks;
      const recovered = formatRecoveryAmount({
        ratio,
        current: args.currentMp,
        max: args.maxMp,
      });
      return recovered === null
        ? `战前回复 ${formatPercent(ratio)} 缺失法力`
        : `战前回复 ${formatPercent(ratio)} 缺失法力（约 ${recovered} 点）`;
    }
  }
}

function describeFormula(blessingId: TowerBlessingId) {
  switch (blessingId) {
    case 'vitality_surge':
      return '公式：每层体魄 +8%。';
    case 'spirit_surge':
      return '公式：每层灵力 +8%。';
    case 'swift_step':
      return '公式：每层身法 +8%。';
    case 'mind_focus':
      return '公式：每层悟性、神识各 +6%。';
    case 'jade_bones':
      return '公式：每层最大气血 +10%。';
    case 'sea_of_qi':
      return '公式：每层最大法力 +12%。';
    case 'breathing_technique':
      return '公式：每层战前回复 10% 缺失气血。';
    case 'meridian_cycle':
      return '公式：每层战前回复 15% 缺失法力。';
    case 'balanced_dao':
      return '公式：每层五维主属性同步 +5%。';
  }
}

export function getTowerBlessingEffectPreview(
  args: TowerBlessingEffectPreviewArgs,
): TowerBlessingEffectPreview {
  const definition = getTowerBlessingDefinition(args.blessingId);
  const currentStacks = Math.min(
    definition.maxStacks,
    clampStacks(args.currentStacks),
  );
  const nextStacks =
    args.nextStacks == null
      ? undefined
      : Math.min(definition.maxStacks, clampStacks(args.nextStacks));

  return {
    currentLabel: describeStackValue(args.blessingId, currentStacks, args),
    nextLabel:
      nextStacks == null
        ? undefined
        : describeStackValue(args.blessingId, nextStacks, args),
    formulaLabel: `${describeFormula(args.blessingId)} 上限 ${definition.maxStacks} 层。`,
  };
}
