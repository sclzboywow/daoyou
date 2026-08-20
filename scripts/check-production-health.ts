import { sendViaSmtp } from '@server/lib/admin/smtp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const EXPECTED_CONTAINERS = [
  'daoyou-postgres',
  'daoyou-redis',
  'daoyou-hono',
  'daoyou-web',
] as const;
const STATE_DIR = '/home/ubuntu/backups/daoyou/monitor';
const STATE_FILE = `${STATE_DIR}/health-state.json`;
const BACKUP_DIR = '/home/ubuntu/backups/daoyou/postgres';
const ALERT_REPEAT_MS = 6 * 60 * 60 * 1000;
const MAX_BACKUP_AGE_MS = 26 * 60 * 60 * 1000;
const LLM_PROBE_TIMEOUT_MS = 15_000;

interface MonitorState {
  status: 'healthy' | 'unhealthy';
  alertedAt?: string;
}

type LlmProbeRoute = {
  provider: 'alibaba' | 'deepseek';
  model: string;
  apiKey: string;
  baseUrl: string;
};

const QUOTA_PATTERNS = [
  /AllocationQuota\.FreeTierOnly/i,
  /AllocationQuota\.Arrearage/i,
  /\bArrearage\b/i,
  /FreeTierOnly/i,
  /insufficient[_\s-]?balance/i,
  /insufficient[_\s-]?quota/i,
  /out of credits/i,
  /run out of credits/i,
  /quota[_\s-]?exceeded/i,
  /余额不足/,
  /欠费/,
  /额度不足/,
  /额度已用完/,
  /免费额度/,
  /账户余额/,
  /billing/i,
];

async function inspectContainer(name: string): Promise<string | null> {
  const process = Bun.spawn([
    'docker',
    'inspect',
    '--format',
    '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
    name,
  ]);
  const [output, error, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) return error.trim() || null;
  return output.trim() || null;
}

async function getLatestBackupAgeMs(): Promise<number | null> {
  const process = Bun.spawn([
    'find',
    BACKUP_DIR,
    '-maxdepth',
    '1',
    '-type',
    'f',
    '-name',
    'daoyou-*.dump',
    '-printf',
    '%T@\n',
  ]);
  const [output, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    process.exited,
  ]);
  if (exitCode !== 0) return null;
  const newestSeconds = output
    .split('\n')
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  return newestSeconds ? Date.now() - newestSeconds * 1000 : null;
}

async function loadState(): Promise<MonitorState | null> {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8')) as MonitorState;
  } catch {
    return null;
  }
}

async function saveState(state: MonitorState): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true, mode: 0o700 });
  await writeFile(STATE_FILE, `${JSON.stringify(state)}\n`, { mode: 0o600 });
}

async function sendAlert(subject: string, content: string): Promise<void> {
  const recipients = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
  if (recipients.length === 0) throw new Error('ADMIN_EMAILS is empty');
  await Promise.all(
    recipients.map((email) => sendViaSmtp(email, subject, content)),
  );
}

function firstProviderEntry(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw.split(',')[0]?.trim().split(':')[0]?.trim() || null;
}

function resolveLlmProbeRoute(): LlmProbeRoute | null {
  const alibabaKey = process.env.ALIBABA_API_KEY?.trim();
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  const explicit = firstProviderEntry(process.env.LLM_PROVIDER);

  const pickAlibaba = (): LlmProbeRoute | null => {
    if (!alibabaKey) return null;
    const model =
      explicit?.includes('/') && explicit.startsWith('alibaba/')
        ? explicit.slice('alibaba/'.length)
        : 'qwen3.7-flash';
    return {
      provider: 'alibaba',
      model: model || 'qwen3.7-flash',
      apiKey: alibabaKey,
      baseUrl: (
        process.env.ALIBABA_BASE_URL?.trim() ||
        'https://dashscope.aliyuncs.com/compatible-mode/v1'
      ).replace(/\/$/, ''),
    };
  };

  const pickDeepseek = (): LlmProbeRoute | null => {
    if (!deepseekKey) return null;
    const model =
      explicit?.includes('/') && explicit.startsWith('deepseek/')
        ? explicit.slice('deepseek/'.length)
        : process.env.DEEPSEEK_MODEL_FAST_USE?.trim() ||
          process.env.DEEPSEEK_MODEL_USE?.trim() ||
          'deepseek-v4-flash';
    return {
      provider: 'deepseek',
      model: model || 'deepseek-v4-flash',
      apiKey: deepseekKey,
      baseUrl: (
        process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com'
      ).replace(/\/$/, ''),
    };
  };

  if (explicit?.startsWith('alibaba')) return pickAlibaba();
  if (explicit?.startsWith('deepseek')) return pickDeepseek();
  return pickAlibaba() ?? pickDeepseek();
}

function isQuotaExhaustedPayload(status: number, body: string): boolean {
  if (QUOTA_PATTERNS.some((pattern) => pattern.test(body))) {
    return true;
  }
  // Provider-specific HTTP statuses commonly used for billing/quota denials.
  if (status === 402 || status === 403) {
    return /quota|balance|billing|arrearage|freetier|额度|余额|欠费/i.test(
      body,
    );
  }
  return false;
}

async function probeLlmQuota(): Promise<string | null> {
  const route = resolveLlmProbeRoute();
  if (!route) {
    return 'LLM probe: no ALIBABA_API_KEY/DEEPSEEK_API_KEY configured';
  }

  try {
    const response = await fetch(`${route.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${route.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: route.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(LLM_PROBE_TIMEOUT_MS),
    });
    const body = await response.text();
    if (response.ok) return null;

    if (isQuotaExhaustedPayload(response.status, body)) {
      return `LLM额度耗尽/欠费: provider=${route.provider} model=${route.model} HTTP ${response.status}`;
    }

    // Auth/config issues are also actionable for ops mail, but keep wording distinct.
    if (response.status === 401) {
      return `LLM鉴权失败: provider=${route.provider} model=${route.model} HTTP 401`;
    }

    return `LLM探测失败: provider=${route.provider} model=${route.model} HTTP ${response.status}`;
  } catch (error) {
    return `LLM探测异常: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function collectFailures(): Promise<string[]> {
  const failures: string[] = [];
  for (const container of EXPECTED_CONTAINERS) {
    const status = await inspectContainer(container);
    if (status !== 'healthy' && status !== 'running') {
      failures.push(`${container}: ${status ?? 'not found'}`);
    }
  }

  try {
    const response = await fetch('https://yzdoc.cn/api/health-check', {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      failures.push(`public health check: HTTP ${response.status}`);
    }
  } catch (error) {
    failures.push(
      `public health check: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const backupAgeMs = await getLatestBackupAgeMs();
  if (backupAgeMs === null) {
    failures.push('PostgreSQL backup: no dump found');
  } else if (backupAgeMs > MAX_BACKUP_AGE_MS) {
    failures.push(
      `PostgreSQL backup: latest dump is ${Math.floor(backupAgeMs / 3_600_000)} hours old`,
    );
  }

  const llmFailure = await probeLlmQuota();
  if (llmFailure) failures.push(llmFailure);

  return failures;
}

function buildAlertSubject(failures: string[]): string {
  if (failures.some((failure) => failure.includes('LLM额度耗尽'))) {
    return '【万界道友】LLM额度不足告警';
  }
  return '【万界道友】生产服务异常';
}

const failures = await collectFailures();
const previous = await loadState();
const now = new Date();

if (process.argv.includes('--dry-run')) {
  console.log(
    JSON.stringify({
      status: failures.length === 0 ? 'healthy' : 'unhealthy',
      failures,
    }),
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

if (failures.length === 0) {
  if (previous?.status === 'unhealthy') {
    await sendAlert(
      '【万界道友】生产服务已恢复',
      `检测时间：${now.toISOString()}\n所有容器、公开健康接口、数据库备份与 LLM 额度探测已恢复正常。`,
    );
  }
  await saveState({ status: 'healthy' });
  console.log('production health check: healthy');
  process.exit(0);
}

const lastAlertAt = previous?.alertedAt
  ? new Date(previous.alertedAt).getTime()
  : 0;
const shouldAlert =
  previous?.status !== 'unhealthy' ||
  Date.now() - lastAlertAt >= ALERT_REPEAT_MS;

if (shouldAlert) {
  await sendAlert(
    buildAlertSubject(failures),
    [
      `检测时间：${now.toISOString()}`,
      '异常项目：',
      ...failures.map((failure) => `- ${failure}`),
      '',
      '请登录 yzdoc 服务器检查 Docker 状态、应用日志，或到百炼/DeepSeek 控制台确认额度与账单。',
    ].join('\n'),
  );
}

await saveState({
  status: 'unhealthy',
  alertedAt: shouldAlert ? now.toISOString() : previous?.alertedAt,
});
console.error('production health check: unhealthy', failures);
process.exit(1);
