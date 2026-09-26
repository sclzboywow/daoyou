export type Attributes = {
  vitality: number;
  strength: number;
  spirit: number;
  endurance: number;
  speed: number;
  willpower: number;
};

export type FateView = {
  name: string;
  quality?: string;
  description?: string;
  effects?: Array<{ label: string; value: number; description: string }>;
};

export type GeneratedCultivator = {
  name: string;
  gender: string;
  origin?: string;
  personality?: string;
  background?: string;
  balance_notes?: string;
  realm: string;
  realm_stage: string;
  age: number;
  lifespan: number;
  attributes: Attributes;
  spiritual_roots: Array<{
    element: string;
    strength: number;
    grade?: string;
  }>;
};

export type GenerationQuota = {
  dailyLimit: number;
  remaining: number;
  remainingByEmail: number;
  remainingByIp: number;
  limitedBy: 'none' | 'email' | 'ip' | 'both';
  ipTracked: boolean;
};

export type GenerationDraft = {
  cultivator: GeneratedCultivator;
  tempCultivatorId: string;
  quota: GenerationQuota;
  fates: FateView[];
  remainingRerolls: number;
};

export type PlayerDetails = {
  cultivatorId: string | null;
  serverTime: string;
  note?: string;
  profile: null | (GeneratedCultivator & {
    id?: string;
    title?: string | null;
    unallocated_attribute_points?: number;
    pre_heaven_fates?: FateView[];
  });
  condition: null | {
    combatV6?: {
      effectiveAttributes: Attributes;
      attrs: Record<string, number>;
    };
    resources?: {
      hp?: { current: number; max?: number };
      mp?: { current: number; max?: number };
    };
  };
  currency: null | {
    spiritStones: number;
    reputation: number;
    qi: number;
    qiLastRefreshedAt: string | null;
  };
  progress: null | {
    cultivation_exp: number;
    exp_cap: number;
    comprehension_insight: number;
  };
  unreadMail: number;
  activeTasks: number;
  claimableTasks: number;
};

export type BagItem = {
  id: string;
  location: 'bag' | 'storage' | 'equipped';
  slotIndex: number | null;
  definitionId: string;
  quantity: number;
  instanceData: unknown;
  stackKey: string | null;
  revision: number;
  name: string;
  equipped: boolean;
};

export type BagView = {
  items: BagItem[];
  equippedItems: BagItem[];
  used: number;
  total: number;
  page: number;
  capacity: number;
};

export type TaskView = {
  id: string;
  status: 'active' | 'completed';
  snapshot: {
    title: string;
    summary: string;
    isCompleted: boolean;
    missingRequirements: string[];
    rewardSummary?: string[];
    rewardClaimedAt?: string;
    currentStageId: string | null;
    currentStageIndex: number;
    totalStages: number;
    stages: Array<{
      id: string;
      title: string;
      description: string;
      completionText: string;
      completed: boolean;
      current: boolean;
      links: Array<{ label: string; href: string }>;
      objectives: Array<{
        id: string;
        title: string;
        description: string;
        completed: boolean;
        progressText: string;
      }>;
    }>;
  };
  metadata?: {
    rewardSummary?: string[];
    rewardClaimedAt?: string;
  };
};

export type MailView = {
  id: string;
  title: string;
  content: string;
  type: 'system' | 'reward';
  attachments: unknown[] | null;
  isRead: boolean;
  isClaimed: boolean;
  createdAt: string;
};

export type StoryView = {
  track: 'main' | 'encounter';
  chapterId: string;
  chapterTitle: string;
  beatId: string;
  kind: 'performance' | 'practice' | 'life';
  scene: string;
  prompt: string;
  href: string;
  scriptId: string | null;
  guideLesson: string | null;
};

export type PerformanceCue =
  | { type: 'scene'; src?: string; alt?: string; focus?: string; tone?: string; when?: PerformanceWhen }
  | { type: 'title'; kicker?: string; text: string; when?: PerformanceWhen }
  | { type: 'narration'; text: string; when?: PerformanceWhen }
  | { type: 'line'; speaker: string; text: string; when?: PerformanceWhen }
  | {
      type: 'choice';
      options: Array<{ label: string; jump?: string; outcome?: string }>;
      when?: PerformanceWhen;
    }
  | { type: 'mark'; id: string }
  | { type: 'end'; outcome: string; when?: PerformanceWhen };

export type PerformanceWhen = { path: string; equals: string };

export type PerformanceScript = {
  id: string;
  title: string;
  requires: string[];
  cast: Record<string, { name: string; portrait?: string }>;
  cues: PerformanceCue[];
};
