import { apiClient } from '../api/ApiClient';
import { gameApi } from '../game/GameApi';
import type {
  BagView,
  FateView,
  GenerationDraft,
  GenerationQuota,
  GeneratedCultivator,
  MailView,
  PerformanceScript,
  PlayerDetails,
  StoryView,
  TaskView,
} from './StageOneTypes';

type Success<T> = { success: true; data: T };

type PlayerResourceEnvelope<T> = {
  data: T;
  resource: {
    scope: { kind: string; id: string };
    topic: string;
    resourceVersion: number;
    scopeVersion: number;
  };
};

type PlayerResourcesResponse = Success<{
  cultivatorId: string | null;
  serverTime: string;
  resources: {
    session?: PlayerResourceEnvelope<{
      activeCultivator: { id: string; status: 'active'; sectId: string | null } | null;
      note?: string;
    }>;
    profile?: PlayerResourceEnvelope<{ cultivator: PlayerDetails['profile'] }>;
    condition?: PlayerResourceEnvelope<NonNullable<PlayerDetails['condition']>>;
    currency?: PlayerResourceEnvelope<NonNullable<PlayerDetails['currency']>>;
    progress?: PlayerResourceEnvelope<NonNullable<PlayerDetails['progress']>>;
    'mail-summary'?: PlayerResourceEnvelope<{ unreadCount: number }>;
    'task-summary'?: PlayerResourceEnvelope<{
      activeCount: number;
      claimableCount: number;
    }>;
  };
}>;

type GenerateCharacterResponse = Success<{
  cultivator: GeneratedCultivator;
  tempCultivatorId: string;
  quota: GenerationQuota;
}>;

type GenerateFatesResponse = Success<{
  fates: FateView[];
  remainingRerolls: number;
}>;

type TaskListResponse = Success<TaskView[]> & {
  resource?: unknown;
};

type StoryResponse = Success<StoryView> & { resource?: unknown };

type MailResponse = {
  mails: MailView[];
  pagination: { page: number; pageSize: number; hasMore: boolean };
};

export class StageOneApi {
  async loadPlayerDetails(): Promise<PlayerDetails> {
    const keys = [
      'session',
      'profile',
      'condition',
      'progress',
      'currency',
      'mail-summary',
      'task-summary',
    ].join(',');
    const response = await apiClient.request<PlayerResourcesResponse>(
      `/api/player/resources?keys=${encodeURIComponent(keys)}`,
    );
    const resources = response.data.resources;
    return {
      cultivatorId: response.data.cultivatorId,
      serverTime: response.data.serverTime,
      note: resources.session?.data.note,
      profile: resources.profile?.data.cultivator ?? null,
      condition: resources.condition?.data ?? null,
      progress: resources.progress?.data ?? null,
      currency: resources.currency?.data ?? null,
      unreadMail: resources['mail-summary']?.data.unreadCount ?? 0,
      activeTasks: resources['task-summary']?.data.activeCount ?? 0,
      claimableTasks: resources['task-summary']?.data.claimableCount ?? 0,
    };
  }

  async updateTitle(title: string | null): Promise<void> {
    await gameApi.updateTitle(title);
  }

  async generationQuota(): Promise<GenerationQuota> {
    const response = await apiClient.request<Success<{ quota: GenerationQuota }>>(
      '/api/generate-character/quota',
    );
    return response.data.quota;
  }

  async generateCharacter(userInput: string): Promise<GenerationDraft> {
    const generated = await apiClient.request<GenerateCharacterResponse>(
      '/api/generate-character',
      { method: 'POST', body: { userInput } },
    );
    const fateResponse = await this.generateFates(generated.data.tempCultivatorId);
    return {
      ...generated.data,
      fates: fateResponse.fates,
      remainingRerolls: fateResponse.remainingRerolls,
    };
  }

  async generateFates(tempId: string): Promise<{
    fates: FateView[];
    remainingRerolls: number;
  }> {
    const response = await apiClient.request<GenerateFatesResponse>(
      '/api/generate-fates',
      { method: 'POST', body: { tempId } },
    );
    return response.data;
  }

  async saveCharacter(
    tempCultivatorId: string,
    selectedFateIndices: number[],
  ): Promise<void> {
    await apiClient.request('/api/save-character', {
      method: 'POST',
      body: { tempCultivatorId, selectedFateIndices },
    });
  }

  async loadBag(): Promise<BagView> {
    const response = await apiClient.request<Success<BagView>>(
      '/api/combat-v6/inventory?location=bag&page=0&kind=all',
    );
    return response.data;
  }

  async inventoryAction(body: Record<string, unknown>): Promise<void> {
    await apiClient.request('/api/combat-v6/inventory', {
      method: 'POST',
      body,
    });
  }

  async consume(
    consumableId: string,
    revision: number,
    quantity = 1,
  ): Promise<void> {
    await apiClient.request('/api/cultivator/consume', {
      method: 'POST',
      body: { consumableId, revision, quantity },
    });
  }

  async loadTasks(): Promise<{ active: TaskView[]; completed: TaskView[] }> {
    const [active, completed] = await Promise.all([
      apiClient.request<TaskListResponse>('/api/tasks?status=active'),
      apiClient.request<TaskListResponse>('/api/tasks?status=completed'),
    ]);
    return { active: active.data, completed: completed.data };
  }

  async claimTask(taskId: string): Promise<void> {
    await apiClient.request(`/api/tasks/${encodeURIComponent(taskId)}/claim-reward`, {
      method: 'POST',
      body: {},
    });
  }

  async loadMail(page = 1, pageSize = 30): Promise<MailResponse> {
    return apiClient.request<MailResponse>(
      `/api/cultivator/mail?page=${page}&pageSize=${pageSize}`,
    );
  }

  async readMail(mailId: string): Promise<void> {
    await apiClient.request('/api/cultivator/mail/read', {
      method: 'POST',
      body: { mailId },
    });
  }

  async readAllMail(): Promise<void> {
    await apiClient.request('/api/cultivator/mail/read-all', {
      method: 'POST',
      body: {},
    });
  }

  async claimMail(mailId: string): Promise<void> {
    await apiClient.request('/api/cultivator/mail/claim', {
      method: 'POST',
      body: { mailId },
    });
  }

  async claimAllMail(): Promise<void> {
    await apiClient.request('/api/cultivator/mail/claim-all', {
      method: 'POST',
      body: {},
    });
  }

  async loadStory(): Promise<StoryView> {
    const response = await apiClient.request<StoryResponse>('/api/story');
    return response.data;
  }

  async loadPerformance(scriptId: string): Promise<PerformanceScript> {
    const response = await apiClient.request<Success<PerformanceScript>>(
      `/api/story/performances/${encodeURIComponent(scriptId)}`,
    );
    return response.data;
  }

  async completePerformance(scriptId: string, outcome: string): Promise<void> {
    await apiClient.request(
      `/api/story/performances/${encodeURIComponent(scriptId)}/complete`,
      { method: 'POST', body: { outcome } },
    );
  }

  async completeGuide(lessonId: string): Promise<void> {
    await apiClient.request(`/api/story/guides/${encodeURIComponent(lessonId)}/complete`, {
      method: 'POST',
      body: {},
    });
  }
}

export const stageOneApi = new StageOneApi();
