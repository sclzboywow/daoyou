/**
 * LLM Base URL 服务端校验
 *
 * 白名单数据来自 shared/config/llmProviders.ts（唯一真源）。
 * 本模块仅包含服务端专用的校验逻辑（HTTPS 强制、URL 解析等）。
 */

import { ALLOWED_LLM_HOSTS } from '@shared/config/llmProviders';

/**
 * 校验 LLM base URL 是否在白名单内
 *
 * @returns 合法时返回规范化后的 URL 字符串，非法时返回 null
 */
export function validateLlmBaseUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  // 仅允许 HTTPS（生产环境安全要求）
  if (parsed.protocol !== 'https:') {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();

  if (!ALLOWED_LLM_HOSTS.has(hostname)) {
    return null;
  }

  return parsed.toString();
}

/**
 * 获取当前白名单列表（用于日志 / 调试 / 管理接口）
 */
export function getAllowedLlmHosts(): readonly string[] {
  return [...ALLOWED_LLM_HOSTS];
}
