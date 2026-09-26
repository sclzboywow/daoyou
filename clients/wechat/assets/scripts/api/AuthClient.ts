import { requestWechatLoginCode } from '../platform/WechatRuntime';
import { apiClient, ApiError } from './ApiClient';
import { sessionStore } from './SessionStore';

type WechatSessionResponse = {
  token: string;
  user: { id: string; name: string };
  isNewUser: boolean;
};

function readHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  wanted: string,
): string | null {
  if (!headers) return null;
  const target = wanted.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }
  return null;
}

export class AuthClient {
  async signInWechat(): Promise<WechatSessionResponse> {
    const code = await requestWechatLoginCode();
    const response = await apiClient.request<WechatSessionResponse>(
      '/api/auth/sign-in/wechat-mini-game',
      {
        method: 'POST',
        body: { code },
        authenticated: false,
      },
    );
    sessionStore.set(response.token);
    return response;
  }

  async registerWechat(name: string): Promise<WechatSessionResponse> {
    const code = await requestWechatLoginCode();
    const response = await apiClient.request<WechatSessionResponse>(
      '/api/auth/sign-up/wechat-mini-game',
      {
        method: 'POST',
        body: { code, name: name.trim() },
        authenticated: false,
      },
    );
    sessionStore.set(response.token);
    return response;
  }

  async sendEmailOtp(email: string): Promise<void> {
    const code = await requestWechatLoginCode();
    await apiClient.request('/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), type: 'sign-in' },
      headers: { 'x-wechat-login-code': code },
      authenticated: false,
    });
  }

  async signInEmailOtp(input: {
    email: string;
    otp: string;
    name?: string;
  }): Promise<void> {
    const result = await apiClient.requestRaw('/api/auth/sign-in/email-otp', {
      method: 'POST',
      body: {
        email: input.email.trim().toLowerCase(),
        otp: input.otp.trim(),
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      },
      authenticated: false,
    });

    const token = readHeader(result.header, 'set-auth-token');
    if (!token) {
      throw new ApiError(
        '邮箱登录成功但服务端未返回 Bearer token，请确认 bearer 插件已启用',
        500,
        'AUTH_TOKEN_MISSING',
      );
    }
    sessionStore.set(token);
  }

  async bindCurrentWechatIdentity(): Promise<void> {
    const code = await requestWechatLoginCode();
    await apiClient.request('/api/auth/link/wechat-mini-game', {
      method: 'POST',
      body: { code },
      authenticated: true,
    });
  }

  signOutLocal(): void {
    sessionStore.clear();
  }
}

export const authClient = new AuthClient();
