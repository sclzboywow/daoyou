import { ItemLibraryRewardSelectionsSchema } from '@shared/lib/itemLibrary';
import { REALM_VALUES } from '@shared/types/constants';
import { z } from 'zod';

export const AdminActivityTypeSchema = z.enum([
  'login_reward',
  'announcement',
  'game_mail',
  'redeem_code',
]);
export type AdminActivityType = z.infer<typeof AdminActivityTypeSchema>;

export const AdminActivityStatusSchema = z.enum([
  'draft',
  'scheduled',
  'active',
  'ended',
  'disabled',
]);
export type AdminActivityStatus = z.infer<typeof AdminActivityStatusSchema>;

export const AdminActivityAudienceSchema = z.object({
  cultivatorCreatedFrom: z.string().optional(),
  cultivatorCreatedTo: z.string().optional(),
  realmMin: z.enum(REALM_VALUES).optional(),
  realmMax: z.enum(REALM_VALUES).optional(),
});
export type AdminActivityAudience = z.infer<
  typeof AdminActivityAudienceSchema
>;

const RewardSnapshotSchema = z.array(z.unknown()).optional();

export const AdminActivityConfigSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('login_reward'),
    description: z.string().trim().min(1).max(2_000),
    mailTitle: z.string().trim().min(1).max(200),
    mailContent: z.string().trim().min(1).max(10_000),
    rewardSelections: ItemLibraryRewardSelectionsSchema,
    rewardSnapshot: RewardSnapshotSchema,
  }),
  z.object({
    kind: z.literal('announcement'),
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1).max(10_000),
  }),
  z.object({
    kind: z.literal('game_mail'),
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1).max(10_000),
    rewardSelections: ItemLibraryRewardSelectionsSchema.default([]),
    rewardSnapshot: RewardSnapshotSchema,
  }),
  z.object({
    kind: z.literal('redeem_code'),
    code: z.string().trim().min(6).max(64).optional(),
    mailTitle: z.string().trim().min(1).max(200),
    mailContent: z.string().trim().min(1).max(10_000),
    totalLimit: z.number().int().positive().optional(),
    rewardSelections: ItemLibraryRewardSelectionsSchema,
    rewardSnapshot: RewardSnapshotSchema,
    redeemCodeId: z.string().uuid().optional(),
  }),
]);
export type AdminActivityConfig = z.infer<
  typeof AdminActivityConfigSchema
>;

export const AdminActivityWriteSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9_-]*$/),
    name: z.string().trim().min(1).max(160),
    activityType: AdminActivityTypeSchema,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().nullable().optional(),
    audience: AdminActivityAudienceSchema.default({}),
    config: AdminActivityConfigSchema,
  })
  .superRefine((value, context) => {
    if (value.activityType !== value.config.kind) {
      context.addIssue({
        code: 'custom',
        path: ['config', 'kind'],
        message: '活动类型与配置类型不一致',
      });
    }
    if (
      value.endsAt &&
      new Date(value.endsAt).getTime() <= new Date(value.startsAt).getTime()
    ) {
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: '结束时间必须晚于开始时间',
      });
    }
  });
export type AdminActivityWrite = z.infer<
  typeof AdminActivityWriteSchema
>;

export interface AdminActivityView {
  id: string;
  code: string;
  name: string;
  activityType: AdminActivityType;
  status: AdminActivityStatus;
  startsAt: string;
  endsAt: string | null;
  audience: AdminActivityAudience;
  config: AdminActivityConfig;
  version: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerActivityView {
  id: string;
  code: string;
  name: string;
  activityType: 'login_reward' | 'announcement';
  startsAt: string;
  endsAt: string | null;
  title: string;
  content: string;
  rewardSummary: string[];
  claimed: boolean;
}

export type AdminBatchJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partial_failed'
  | 'failed'
  | 'cancelled';

export interface AdminBatchJobView {
  id: string;
  jobType: string;
  status: AdminBatchJobStatus;
  reason: string | null;
  totalCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  errorSummary: string | null;
  requestedByEmail: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminBatchJobItemView {
  id: string;
  targetKey: string;
  status: string;
  attempts: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface SystemJobRunView {
  id: string;
  jobName: string;
  status: string;
  processedCount: number;
  skipped: boolean;
  reason: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface AdminPlayerSearchRow {
  cultivatorId: string;
  userId: string;
  name: string;
  email: string;
  realm: string;
  stage: string;
  status: string;
  spiritStones: number;
  reputation: number;
  createdAt: string | null;
  lastActiveAt: string | null;
}

export interface AdminPlayerDetail {
  player: AdminPlayerSearchRow & {
    qi: number;
    age: number;
    lifespan: number;
  };
  inventory: {
    materialStacks: number;
    materialQuantity: number;
    consumableStacks: number;
    consumableQuantity: number;
    products: number;
  };
  progress: {
    activeTasks: number;
    completedTasks: number;
    mails: number;
    unclaimedRewardMails: number;
    dungeonRuns: number;
  };
  sect: {
    sectId: string;
    contribution: number;
    discipleRank: string;
  } | null;
  recentResourceEvents: Array<{
    id: string;
    resourceKey: string;
    operation: string;
    eventType: string;
    source: string;
    createdAt: string;
  }>;
}

export interface AdminAuditLogView {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  status: string;
  ipAddress: string | null;
  createdAt: string;
}
