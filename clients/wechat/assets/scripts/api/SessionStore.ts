import { getWx } from '../platform/WechatRuntime';

const SESSION_TOKEN_KEY = 'daoyou:session-token';

export class SessionStore {
  get(): string | null {
    const value = getWx().getStorageSync(SESSION_TOKEN_KEY);
    return typeof value === 'string' && value.trim() ? value : null;
  }

  set(token: string): void {
    getWx().setStorageSync(SESSION_TOKEN_KEY, token);
  }

  clear(): void {
    getWx().removeStorageSync(SESSION_TOKEN_KEY);
  }
}

export const sessionStore = new SessionStore();
