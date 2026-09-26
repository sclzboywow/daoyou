import { getWx } from '../platform/WechatRuntime';

const PRODUCTION_API_BASE_URL = 'https://yzdoc.cn';
const STORAGE_OVERRIDE_KEY = 'daoyou:api-base-url';

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function getApiBaseUrl(): string {
  const wx = getWx();
  const override = wx.getStorageSync(STORAGE_OVERRIDE_KEY);
  if (typeof override === 'string' && override.trim()) {
    return normalizeBaseUrl(override);
  }
  return normalizeBaseUrl(PRODUCTION_API_BASE_URL);
}

export function getRealtimeUrl(): string {
  const base = getApiBaseUrl();
  const socketBase = base.startsWith('https://')
    ? `wss://${base.slice('https://'.length)}`
    : base.startsWith('http://')
      ? `ws://${base.slice('http://'.length)}`
      : base;
  return `${socketBase}/api/realtime`;
}

export const runtimeConfig = {
  storageOverrideKey: STORAGE_OVERRIDE_KEY,
} as const;
