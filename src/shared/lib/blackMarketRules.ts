import {
  BASE_PRICES,
  TYPE_MULTIPLIERS,
} from '@shared/engine/material/creation/config';
import type {
  BlackMarketNpcId,
  BlackMarketRevealRating,
} from '@shared/types/blackMarket';
import type { MaterialType, Quality } from '@shared/types/constants';

export const BLACK_MARKET_REFRESH_MS = 2 * 60 * 60 * 1000;
export const BLACK_MARKET_MAX_INSPECTIONS = 3;
export const BLACK_MARKET_MAX_HAGGLES = 2;

export type BlackMarketNegotiationStrategy =
  'reason' | 'relationship' | 'pressure' | 'bluff' | 'direct_offer' | 'unknown';

export interface BlackMarketPricingState {
  anchorValue: number;
  initialPrice: number;
  currentPrice: number;
  floorPrice: number;
  patience: number;
}

export interface BlackMarketHaggleDecision {
  outcome: 'accepted' | 'countered' | 'conceded' | 'rejected' | 'locked';
  nextPrice: number;
  nextPatience: number;
}

const NPC_STRATEGY_SCORE: Record<
  BlackMarketNpcId,
  Partial<Record<BlackMarketNegotiationStrategy, number>>
> = {
  'smiling-keeper': {
    relationship: 0.22,
    bluff: 0.08,
    reason: 0.02,
    pressure: -0.2,
  },
  'silent-elder': {
    reason: 0.24,
    direct_offer: 0.04,
    bluff: -0.12,
    pressure: -0.18,
  },
  'urgent-cultivator': {
    direct_offer: 0.2,
    pressure: 0.05,
    relationship: -0.05,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Stable, platform-independent unit interval value. The server must feed this
 * with a secret-derived seed; the value itself is deliberately pure for tests.
 */
export function blackMarketUnit(seed: string, label: string): number {
  let hash = 2166136261;
  const input = `${seed}:${label}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

export function computeBlackMarketAnchorValue(input: {
  quality: Quality;
  materialType: MaterialType;
  regionFactor: number;
}): number {
  return Math.max(
    1,
    Math.round(
      BASE_PRICES[input.quality] *
        (TYPE_MULTIPLIERS[input.materialType] ?? 1) *
        clamp(input.regionFactor, 0.5, 2),
    ),
  );
}

export function createBlackMarketPricing(input: {
  seed: string;
  npcId: BlackMarketNpcId;
  anchorValue: number;
}): BlackMarketPricingState {
  const initialBias =
    input.npcId === 'smiling-keeper'
      ? 0.05
      : input.npcId === 'urgent-cultivator'
        ? -0.05
        : 0;
  const floorBias =
    input.npcId === 'silent-elder'
      ? 0.06
      : input.npcId === 'urgent-cultivator'
        ? -0.07
        : 0.02;
  const initialMultiplier = clamp(
    1.2 + blackMarketUnit(input.seed, 'initial-price') * 0.8 + initialBias,
    1.2,
    2,
  );
  const floorMultiplier = clamp(
    0.5 + blackMarketUnit(input.seed, 'floor-price') * 0.5 + floorBias,
    0.5,
    1,
  );
  const initialPrice = Math.max(
    1,
    Math.round(input.anchorValue * initialMultiplier),
  );

  return {
    anchorValue: input.anchorValue,
    initialPrice,
    currentPrice: initialPrice,
    floorPrice: Math.max(1, Math.round(input.anchorValue * floorMultiplier)),
    patience: 2 + Math.floor(blackMarketUnit(input.seed, 'patience') * 3),
  };
}

export function evaluateBlackMarketHaggle(input: {
  npcId: BlackMarketNpcId;
  currentPrice: number;
  floorPrice: number;
  offeredPrice: number;
  patience: number;
  strategy: BlackMarketNegotiationStrategy;
  argumentQuality: 0 | 1 | 2;
  validEvidenceCount: number;
  randomRoll: number;
  isFinalTurn: boolean;
}): BlackMarketHaggleDecision {
  const currentPrice = Math.max(1, Math.round(input.currentPrice));
  const floorPrice = clamp(Math.round(input.floorPrice), 1, currentPrice);
  const offeredPrice = clamp(Math.round(input.offeredPrice), 1, currentPrice);
  const offerProgress =
    currentPrice === floorPrice
      ? 1
      : clamp((offeredPrice - floorPrice) / (currentPrice - floorPrice), -1, 1);
  const strategyScore = NPC_STRATEGY_SCORE[input.npcId][input.strategy] ?? 0;
  const persuasion =
    input.argumentQuality * 0.14 +
    Math.min(2, input.validEvidenceCount) * 0.1 +
    strategyScore +
    (clamp(input.randomRoll, 0, 1) - 0.5) * 0.34;
  const acceptThreshold = 0.52 - persuasion;

  if (offeredPrice >= floorPrice && offerProgress >= acceptThreshold) {
    return {
      outcome: 'accepted',
      nextPrice: offeredPrice,
      nextPatience: input.patience,
    };
  }

  const nextPatience = Math.max(
    0,
    input.patience - (offeredPrice < floorPrice * 0.72 ? 2 : 1),
  );
  if (nextPatience === 0) {
    return {
      outcome: 'locked',
      nextPrice: currentPrice,
      nextPatience,
    };
  }

  const concessionStrength = clamp(
    0.16 + persuasion * 0.32 + clamp(input.randomRoll, 0, 1) * 0.12,
    0.05,
    0.48,
  );
  const counterTarget = Math.max(
    floorPrice,
    Math.round(
      currentPrice - (currentPrice - offeredPrice) * concessionStrength,
    ),
  );

  if (counterTarget < currentPrice) {
    return {
      outcome: input.isFinalTurn ? 'countered' : 'conceded',
      nextPrice: counterTarget,
      nextPatience,
    };
  }

  return {
    outcome: input.isFinalTurn ? 'locked' : 'rejected',
    nextPrice: currentPrice,
    nextPatience,
  };
}

export function classifyBlackMarketReveal(
  paidPrice: number,
  anchorValue: number,
): { valueRatio: number; rating: BlackMarketRevealRating } {
  const valueRatio = anchorValue / Math.max(1, paidPrice);
  const paidToValue = paidPrice / Math.max(1, anchorValue);
  const rating: BlackMarketRevealRating =
    paidToValue >= 1.55
      ? '血亏'
      : paidToValue >= 1.12
        ? '小亏'
        : paidToValue >= 0.9
          ? '公允'
          : paidToValue >= 0.74
            ? '小赚'
            : paidToValue >= 0.58
              ? '捡漏'
              : '天降横财';
  return { valueRatio, rating };
}
