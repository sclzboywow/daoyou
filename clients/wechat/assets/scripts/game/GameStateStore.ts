import { realtimeClient, type RealtimeEvent } from '../api/RealtimeClient';
import { gameApi } from './GameApi';
import type { DashboardView, InventorySummary } from './GameTypes';

export type GameStateSnapshot = {
  dashboard: DashboardView | null;
  inventory: InventorySummary | null;
  realtime: 'offline' | 'connecting' | 'ready' | 'error';
  lastError: string | null;
};

export class GameStateStore {
  private state: GameStateSnapshot = {
    dashboard: null,
    inventory: null,
    realtime: 'offline',
    lastError: null,
  };
  private listeners = new Set<(state: GameStateSnapshot) => void>();
  private realtimeUnsubscribe: (() => void) | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  snapshot(): GameStateSnapshot {
    return this.state;
  }

  subscribe(listener: (state: GameStateSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.performRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  connectRealtime(): void {
    if (this.realtimeUnsubscribe) return;
    this.realtimeUnsubscribe = realtimeClient.subscribe((event) =>
      this.handleRealtime(event),
    );
    this.openRealtime();
  }

  disconnectRealtime(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.realtimeUnsubscribe?.();
    this.realtimeUnsubscribe = null;
    realtimeClient.close();
    this.patch({ realtime: 'offline' });
  }

  private async performRefresh(): Promise<void> {
    try {
      const dashboard = await gameApi.loadDashboard();
      const inventory = dashboard.cultivatorId
        ? await gameApi.loadInventory()
        : null;
      this.state = {
        ...this.state,
        dashboard,
        inventory,
        lastError: null,
      };
      this.emit();
    } catch (error) {
      this.patch({
        lastError: error instanceof Error ? error.message : '读取游戏状态失败',
      });
      throw error;
    }
  }

  private handleRealtime(event: RealtimeEvent): void {
    if (event.type === 'socket.open') {
      this.patch({ realtime: 'connecting' });
      return;
    }
    if (event.type === 'ready') {
      this.patch({ realtime: 'ready' });
      return;
    }
    if (event.type === 'socket.closed') {
      this.patch({ realtime: 'offline' });
      this.scheduleReconnect();
      return;
    }
    if (event.type === 'socket.error') {
      this.patch({ realtime: 'error' });
      this.scheduleReconnect();
      return;
    }
    if (event.type === 'player-state.events') {
      this.scheduleRefresh();
    }
  }

  private openRealtime(): void {
    this.patch({ realtime: 'connecting' });
    try {
      realtimeClient.connect(['player-state', 'world-chat']);
    } catch (error) {
      this.patch({
        realtime: 'error',
        lastError: error instanceof Error ? error.message : '实时连接失败',
      });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.realtimeUnsubscribe || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.realtimeUnsubscribe) this.openRealtime();
    }, 2_000);
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh().catch(() => undefined);
    }, 250);
  }

  private patch(patch: Partial<GameStateSnapshot>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}

export const gameStateStore = new GameStateStore();
