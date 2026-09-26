export type WxRequestResult = {
  data: unknown;
  statusCode: number;
  header?: Record<string, string | string[] | undefined>;
};

export type WxSocketTask = {
  onOpen(callback: () => void): void;
  onMessage(callback: (event: { data: string | ArrayBuffer }) => void): void;
  onClose(callback: (event: { code?: number; reason?: string }) => void): void;
  onError(callback: (error: unknown) => void): void;
  send(options: { data: string }): void;
  close(options?: { code?: number; reason?: string }): void;
};

export type WxApi = {
  login(options: {
    success(result: { code?: string }): void;
    fail(error: unknown): void;
  }): void;
  request(options: {
    url: string;
    method?: string;
    data?: unknown;
    header?: Record<string, string>;
    timeout?: number;
    success(result: WxRequestResult): void;
    fail(error: unknown): void;
  }): void;
  connectSocket(options: {
    url: string;
    header?: Record<string, string>;
    success?(): void;
    fail?(error: unknown): void;
  }): WxSocketTask;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
};

export function getWx(): WxApi {
  const runtime = (globalThis as { wx?: WxApi }).wx;
  if (!runtime) {
    throw new Error('当前运行环境不是微信小游戏');
  }
  return runtime;
}

export function requestWechatLoginCode(): Promise<string> {
  const wx = getWx();
  return new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        if (!result.code) {
          reject(new Error('wx.login 未返回 code'));
          return;
        }
        resolve(result.code);
      },
      fail(error) {
        reject(error instanceof Error ? error : new Error('wx.login 失败'));
      },
    });
  });
}
