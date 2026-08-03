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

interface MonitorState {
  status: 'healthy' | 'unhealthy';
  alertedAt?: string;
}

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
  return failures;
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
      `检测时间：${now.toISOString()}\n所有容器、公开健康接口与数据库备份已恢复正常。`,
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
    '【万界道友】生产服务异常',
    [
      `检测时间：${now.toISOString()}`,
      '异常项目：',
      ...failures.map((failure) => `- ${failure}`),
      '',
      '请登录 yzdoc 服务器检查 Docker 状态与应用日志。',
    ].join('\n'),
  );
}

await saveState({
  status: 'unhealthy',
  alertedAt: shouldAlert ? now.toISOString() : previous?.alertedAt,
});
console.error('production health check: unhealthy', failures);
process.exit(1);
