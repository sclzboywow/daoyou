import { z } from 'zod';
export const REWARDED_AD_UNITS = {
  yield: 'adunit-dd9c75755666cd7f',
  recovery: 'adunit-8620460ebe1846cd',
} as const;
export const RewardedAdPrepareSchema = z
  .object({
    placement: z.enum(['yield', 'recovery']),
    battleId: z.uuid().optional(),
  })
  .strict()
  .refine((v) => !v.battleId || v.placement === 'recovery');
export const RewardedAdStatusQuerySchema = z
  .object({ battleId: z.uuid().optional() })
  .strict();
export const RewardedAdClaimSchema = z
  .object({ ticketId: z.uuid(), adCompleted: z.literal(true) })
  .strict();
export const YieldAdClaimSchema = z.union([
  z.object({}).strict(),
  z.object({ adTicketId: z.uuid(), adCompleted: z.literal(true) }).strict(),
]);
export type RewardedAdStatus = {
  enabled: boolean;
  yieldAvailable: boolean;
  recoveryAvailable: boolean;
  recoveryBattleId: string | null;
  recoveryMode?: 'combat';
};
export type RewardedAdTicket = {
  ticketId: string;
  adUnitId: string;
  placement: 'yield' | 'recovery';
  expiresAt: string;
  verification: {
    userId: string;
    rewardItem: string;
    rewardAmount: number;
    customData: string;
  };
};
