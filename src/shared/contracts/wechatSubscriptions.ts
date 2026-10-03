import { z } from 'zod';

export const QiFullSubscriptionSchema = z
  .object({
    templateId: z.string().trim().min(1).max(128),
  })
  .strict();

export interface WechatQiSubscriptionStatus {
  wechatLinked: boolean;
  subscription: {
    qiFull: {
      enabled: boolean;
      templateId: string;
      currentQi: number;
      maxQi: number;
      pending: { id: string; status: string; targetAt: string } | null;
    };
  };
}
