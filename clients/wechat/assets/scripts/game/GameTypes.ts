export type ResourceReadMeta = {
  scope: { kind: string; id: string };
  topic: string;
  resourceVersion: number;
  scopeVersion: number;
};

export type DashboardCultivator = {
  id?: string;
  name: string;
  title?: string | null;
  realm: string;
  realm_stage: string;
  age: number;
  lifespan: number;
};

export type PlayerResourcesResponse = {
  success: true;
  data: {
    cultivatorId: string | null;
    serverTime: string;
    resources: {
      session?: {
        data: {
          activeCultivator: {
            id: string;
            status: 'active';
            sectId: string | null;
          } | null;
          note?: string;
        };
        resource: ResourceReadMeta;
      };
      profile?: {
        data: { cultivator: DashboardCultivator };
        resource: ResourceReadMeta;
      };
      currency?: {
        data: {
          spiritStones: number;
          reputation: number;
          qi: number;
          qiLastRefreshedAt: string | null;
        };
        resource: ResourceReadMeta;
      };
      'mail-summary'?: {
        data: { unreadCount: number };
        resource: ResourceReadMeta;
      };
      'task-summary'?: {
        data: { activeCount: number; claimableCount: number };
        resource: ResourceReadMeta;
      };
    };
  };
};

export type DashboardView = {
  cultivatorId: string | null;
  cultivator: DashboardCultivator | null;
  currency: {
    spiritStones: number;
    reputation: number;
    qi: number;
    qiLastRefreshedAt: string | null;
  } | null;
  unreadMail: number;
  activeTasks: number;
  claimableTasks: number;
  serverTime: string;
  note?: string;
};

export type InventoryItemView = {
  id?: string;
  name: string;
  quantity?: number;
  category: 'artifacts' | 'materials' | 'consumables';
};

export type InventoryPageResponse = {
  success: true;
  data: {
    items: Array<Record<string, unknown> & { id?: string; name: string; quantity?: number }>;
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  };
  resource: ResourceReadMeta;
};

export type InventorySummary = {
  totals: Record<'artifacts' | 'materials' | 'consumables', number>;
  items: InventoryItemView[];
};
