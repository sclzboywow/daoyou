import { apiClient } from '../api/ApiClient';
import type {
  DashboardView,
  InventoryItemView,
  InventoryPageResponse,
  InventorySummary,
  PlayerResourcesResponse,
} from './GameTypes';

const DASHBOARD_KEYS = [
  'session',
  'profile',
  'currency',
  'mail-summary',
  'task-summary',
].join(',');

export class GameApi {
  async loadDashboard(): Promise<DashboardView> {
    const response = await apiClient.request<PlayerResourcesResponse>(
      `/api/player/resources?keys=${encodeURIComponent(DASHBOARD_KEYS)}`,
    );
    const resources = response.data.resources;
    return {
      cultivatorId: response.data.cultivatorId,
      cultivator: resources.profile?.data.cultivator ?? null,
      currency: resources.currency?.data ?? null,
      unreadMail: resources['mail-summary']?.data.unreadCount ?? 0,
      activeTasks: resources['task-summary']?.data.activeCount ?? 0,
      claimableTasks: resources['task-summary']?.data.claimableCount ?? 0,
      serverTime: response.data.serverTime,
      note: resources.session?.data.note,
    };
  }

  async loadInventory(): Promise<InventorySummary> {
    const categories = ['artifacts', 'materials', 'consumables'] as const;
    const pages = await Promise.all(
      categories.map((category) =>
        apiClient.request<InventoryPageResponse>(
          `/api/cultivator/inventory?type=${category}&page=1&pageSize=30`,
        ),
      ),
    );

    const totals = {
      artifacts: pages[0].data.pagination.total,
      materials: pages[1].data.pagination.total,
      consumables: pages[2].data.pagination.total,
    };
    const items: InventoryItemView[] = pages.flatMap((page, pageIndex) =>
      page.data.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
        category: categories[pageIndex],
      })),
    );
    return { totals, items };
  }

  async updateTitle(title: string | null): Promise<void> {
    await apiClient.request('/api/cultivator/title', {
      method: 'POST',
      body: { title },
    });
  }
}

export const gameApi = new GameApi();
