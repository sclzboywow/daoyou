import { z } from 'zod';

const accessTokenSchema = z
  .object({
    access_token: z.string().min(1).optional(),
    expires_in: z.number().int().positive().optional(),
    errcode: z.number().int().optional(),
    errmsg: z.string().optional(),
  })
  .passthrough();

const subscribeSendSchema = z
  .object({
    errcode: z.number().int().optional(),
    errmsg: z.string().optional(),
  })
  .passthrough();

type AccessTokenCache = {
  token: string;
  expiresAtMs: number;
};

let accessTokenCache: AccessTokenCache | null = null;
let inFlightToken: Promise<string> | null = null;

export class WechatMiniGameApiError extends Error {
  constructor(
    message: string,
    readonly code: number | string,
  ) {
    super(message);
  }
}

function requiredWechatCredentials() {
  const appId = process.env.WECHAT_MINI_GAME_APP_ID?.trim();
  const appSecret = process.env.WECHAT_MINI_GAME_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new WechatMiniGameApiError('微信小游戏服务尚未配置', 'NOT_CONFIGURED');
  }
  return { appId, appSecret };
}

async function requestAccessToken(): Promise<string> {
  const { appId, appSecret } = requiredWechatCredentials();
  const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
  url.searchParams.set('grant_type', 'client_credential');
  url.searchParams.set('appid', appId);
  url.searchParams.set('secret', appSecret);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new WechatMiniGameApiError('微信 access_token 服务暂不可用', 'UNAVAILABLE');
  }
  if (!response.ok) {
    throw new WechatMiniGameApiError('微信 access_token 服务响应异常', response.status);
  }

  const parsed = accessTokenSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success || parsed.data.errcode || !parsed.data.access_token) {
    throw new WechatMiniGameApiError(
      parsed.success ? parsed.data.errmsg || '获取微信 access_token 失败' : '微信 access_token 响应格式异常',
      parsed.success ? parsed.data.errcode ?? 'INVALID_RESPONSE' : 'INVALID_RESPONSE',
    );
  }

  const expiresInSeconds = Math.max(300, parsed.data.expires_in ?? 7_200);
  accessTokenCache = {
    token: parsed.data.access_token,
    expiresAtMs: Date.now() + Math.max(60, expiresInSeconds - 300) * 1_000,
  };
  return parsed.data.access_token;
}

export async function getWechatMiniGameAccessToken(): Promise<string> {
  if (accessTokenCache && accessTokenCache.expiresAtMs > Date.now()) {
    return accessTokenCache.token;
  }
  if (!inFlightToken) {
    inFlightToken = requestAccessToken().finally(() => {
      inFlightToken = null;
    });
  }
  return inFlightToken;
}

export function clearWechatMiniGameAccessTokenCache(): void {
  accessTokenCache = null;
}

export async function sendWechatMiniGameSubscribeMessage(input: {
  openId: string;
  templateId: string;
  data: Record<string, { value: string }>;
  page?: string;
}): Promise<void> {
  const send = async (retryAfterTokenInvalid: boolean): Promise<void> => {
    const token = await getWechatMiniGameAccessToken();
    const url = new URL('https://api.weixin.qq.com/cgi-bin/message/subscribe/send');
    url.searchParams.set('access_token', token);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          touser: input.openId,
          template_id: input.templateId,
          data: input.data,
          ...(input.page ? { page: input.page } : {}),
          miniprogram_state:
            process.env.WECHAT_MINI_GAME_MESSAGE_STATE?.trim() || 'formal',
          lang: 'zh_CN',
        }),
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new WechatMiniGameApiError('微信订阅消息服务暂不可用', 'UNAVAILABLE');
    }

    if (!response.ok) {
      throw new WechatMiniGameApiError('微信订阅消息服务响应异常', response.status);
    }
    const parsed = subscribeSendSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new WechatMiniGameApiError('微信订阅消息响应格式异常', 'INVALID_RESPONSE');
    }
    const errcode = parsed.data.errcode ?? 0;
    if (errcode === 0) return;

    // access_token 失效时清缓存并只重试一次，避免瞬时轮换导致丢消息。
    if (retryAfterTokenInvalid && [40001, 40014, 42001].includes(errcode)) {
      clearWechatMiniGameAccessTokenCache();
      await send(false);
      return;
    }
    throw new WechatMiniGameApiError(
      parsed.data.errmsg || '微信订阅消息发送失败',
      errcode,
    );
  };

  await send(true);
}
