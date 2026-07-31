/**
 * LLM 服务商配置 — 前后端唯一真源 (Single Source of Truth)
 *
 * 新增 / 修改供应商只需编辑此文件，前后端自动同步：
 *   - 前端：配置页下拉列表 + 只读 Base URL 展示
 *   - 后端：ALLOWED_LLM_HOSTS 白名单校验
 *
 * 设计约束：
 *   - host 字段用于服务端白名单校验（仅 hostname，不含路径）
 *   - baseUrl 字段用于前端展示和实际请求（完整 URL，含 API 路径前缀）
 *   - host 必须能从 baseUrl 中解析得到（由单元测试强制保证一致性）
 */

export interface LlmProviderConfig {
  /** 供应商标识符，作为 select option value 和 localStorage key */
  readonly id: string;
  /** 前端展示名称 */
  readonly label: string;
  /** 白名单域名（hostname only，用于服务端校验） */
  readonly host: string;
  /** 完整的 API Base URL（含路径前缀，前端直接使用） */
  readonly baseUrl: string;
  /** 默认普通模型 */
  readonly model: string;
  /** 默认快速模型 */
  readonly fastModel: string;
}

export const LLM_PROVIDERS: readonly LlmProviderConfig[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek 深度求索',
    host: 'api.deepseek.com',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    fastModel: 'deepseek-chat',
  },
  {
    id: 'alibaba',
    label: '阿里云 通义千问',
    host: 'dashscope.aliyuncs.com',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-turbo',
    fastModel: 'qwen-turbo',
  },
  {
    id: 'zhipu',
    label: '智谱 AI (GLM)',
    host: 'open.bigmodel.cn',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    fastModel: 'glm-4-flash',
  },
  {
    id: 'kimi',
    label: '月之暗面 Kimi',
    host: 'api.moonshot.cn',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    fastModel: 'moonshot-v1-8k',
  },
  {
    id: 'ark',
    label: '火山引擎 豆包',
    host: 'ark.cn-beijing.volces.com',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-pro-32k',
    fastModel: 'doubao-lite-32k',
  },
  {
    id: 'stepfun',
    label: '阶跃星辰',
    host: 'api.stepfun.com',
    baseUrl: 'https://api.stepfun.com/v1',
    model: 'step-2-16k',
    fastModel: 'step-2-16k',
  },
  {
    id: 'yi',
    label: '零一万物 Yi',
    host: 'api.lingyiwanwu.com',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    model: 'yi-large',
    fastModel: 'yi-medium',
  },
  {
    id: 'minimax',
    label: 'MiniMax 稀宇科技',
    host: 'api.minimax.chat',
    baseUrl: 'https://api.minimax.chat/v1',
    model: 'abab6.5s-chat',
    fastModel: 'abab5.5-chat',
  },
  {
    id: 'baichuan',
    label: '百川智能',
    host: 'api.baichuan-ai.com',
    baseUrl: 'https://api.baichuan-ai.com/v1',
    model: 'Baichuan4',
    fastModel: 'Baichuan3-Turbo',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    host: 'openrouter.ai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'deepseek/deepseek-chat',
    fastModel: 'deepseek/deepseek-chat',
  },
] as const;

/**
 * 从供应商列表自动派生白名单 Set。
 * 新增供应商时自动加入白名单，无需额外维护。
 */
export const ALLOWED_LLM_HOSTS: ReadonlySet<string> = new Set(
  LLM_PROVIDERS.map((p) => p.host),
);

/**
 * 按 id 查找供应商配置，未找到返回 undefined。
 */
export function findLlmProvider(id: string): LlmProviderConfig | undefined {
  return LLM_PROVIDERS.find((p) => p.id === id);
}
