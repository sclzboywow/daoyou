import type { ApiSuccess } from '@shared/contracts/http';
import { z } from 'zod';

export const AccountSetPasswordRequestSchema = z.object({
  newPassword: z.string().min(1, '请输入新密码'),
});

export type AccountSetPasswordRequest = z.infer<
  typeof AccountSetPasswordRequestSchema
>;

export type AccountSetPasswordResponse = ApiSuccess<{
  status: boolean;
}>;

export const AccountLinkCreateRequestSchema = z.object({
  targetUserId: z.string().uuid('请输入有效的用户 ID'),
});

export type AccountLinkCreateRequest = z.infer<
  typeof AccountLinkCreateRequestSchema
>;

export const AccountLinkRespondRequestSchema = z.object({
  action: z.enum(['confirm', 'reject']),
});

export const AccountLinkRequestIdSchema = z.string().uuid();

export type AccountLinkRespondRequest = z.infer<
  typeof AccountLinkRespondRequestSchema
>;

export type AccountLinkPlatform = 'pc' | 'wechat';
export type AccountLinkRequestStatus =
  'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'expired';

export interface AccountLinkIdentitySummary {
  userId: string;
  name: string;
  platform: AccountLinkPlatform;
  cultivator: {
    id: string;
    name: string;
    realm: string;
  } | null;
}

export interface AccountLinkRequestSummary {
  id: string;
  direction: 'incoming' | 'outgoing';
  status: AccountLinkRequestStatus;
  counterpart: AccountLinkIdentitySummary;
  expiresAt: string;
  createdAt: string;
}

export interface AccountLinkStatusData {
  userId: string;
  linked: boolean;
  hasPcIdentity: boolean;
  hasWechatIdentity: boolean;
  requests: AccountLinkRequestSummary[];
}

export type AccountLinkStatusResponse = ApiSuccess<AccountLinkStatusData>;
export type AccountLinkCreateResponse = ApiSuccess<AccountLinkRequestSummary>;
export type AccountLinkRespondResponse = ApiSuccess<{
  status: 'confirmed' | 'rejected';
  primaryUserId?: string;
  reauthRequired: boolean;
}>;
