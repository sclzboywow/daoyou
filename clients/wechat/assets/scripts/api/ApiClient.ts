import { getApiBaseUrl } from '../config/RuntimeConfig';
import { getWx, type WxRequestResult } from '../platform/WechatRuntime';
import { sessionStore } from './SessionStore';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  authenticated?: boolean;
};

function errorFromResponse(result: WxRequestResult): ApiError {
  const body =
    result.data && typeof result.data === 'object'
      ? (result.data as Record<string, unknown>)
      : {};
  const message =
    typeof body.error === 'string'
      ? body.error
      : typeof body.message === 'string'
        ? body.message
        : `请求失败 (${result.statusCode})`;
  const code = typeof body.code === 'string' ? body.code : undefined;
  return new ApiError(message, result.statusCode, code, body);
}

export class ApiClient {
  async requestRaw(path: string, options: RequestOptions = {}): Promise<WxRequestResult> {
    const wx = getWx();
    const token = options.authenticated === false ? null : sessionStore.get();
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    const result = await new Promise<WxRequestResult>((resolve, reject) => {
      wx.request({
        url: `${getApiBaseUrl()}${path}`,
        method: options.method ?? 'GET',
        data: options.body,
        header: headers,
        timeout: 15_000,
        success: resolve,
        fail(error) {
          reject(error instanceof Error ? error : new Error('网络请求失败'));
        },
      });
    });

    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw errorFromResponse(result);
    }
    return result;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const result = await this.requestRaw(path, options);
    return result.data as T;
  }
}

export const apiClient = new ApiClient();
