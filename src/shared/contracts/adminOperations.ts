import type { MaterialType, Quality } from '@shared/types/constants';

export interface AdminOperationsRealmRow {
  realm: string;
  stage: string;
  count: number;
}

export interface AdminOperationsTutorialRow {
  definitionId: string;
  title: string;
  assigned: number;
  completed: number;
  rewardSent: number;
}

export interface AdminOperationsMaterialCell {
  materialType: MaterialType;
  quality: Quality;
  current: number;
  target: number;
  deficit: number;
}

export interface AdminOperationsSnapshot {
  generatedAt: string;
  windowStartedAt: string;
  security: {
    altchaEnabled: boolean;
  };
  players: {
    total: number;
    active24h: number;
    active7d: number;
    realms: AdminOperationsRealmRow[];
  };
  tutorials: AdminOperationsTutorialRow[];
  mail: {
    unread: number;
    unclaimedRewards: number;
  };
  gameplay24h: {
    dungeonRuns: number;
    dungeonPlayers: number;
    sectTasksCompleted: number;
  };
  economy: {
    totalSpiritStones: number;
    totalReputation: number;
    totalSectContribution: number;
    sectShopPurchases24h: number;
    reputationShopPurchases24h: number;
  };
  delivery: {
    pendingTransactionMessages: number;
  };
  materials: {
    published: number;
    deficientCells: number;
    totalDeficit: number;
    cells: AdminOperationsMaterialCell[];
  };
}

export interface AdminOperationsResponse {
  success: true;
  data: AdminOperationsSnapshot;
}
