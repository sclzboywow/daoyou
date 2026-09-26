import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
const warnings = [];

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push(`missing required file: ${rel}`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

function walk(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  const out = [];
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

const baseline = read('WECHAT_BASELINE.md');
for (const marker of ['4d656dfff5b6', '5094bdf82e1b', 'Cocos Creator `3.8.8`']) {
  if (!baseline.includes(marker)) failures.push(`baseline marker missing: ${marker}`);
}

const auth = read('src/server/lib/auth/auth.ts');
if (!auth.includes('bearer()')) failures.push('Better Auth bearer plugin is not enabled');
if (!auth.includes('wechatMiniGameAuth()')) failures.push('WeChat auth plugin is not enabled');

const authHono = read('src/server/lib/auth/hono.ts');
if (!authHono.includes("x-wechat-login-code")) {
  failures.push('WeChat email-auth anti-abuse header is not handled');
}

const envExample = read('env/example.env');
for (const key of ['WECHAT_MINI_GAME_APP_ID=', 'WECHAT_MINI_GAME_APP_SECRET=']) {
  if (!envExample.includes(key)) failures.push(`env example missing ${key}`);
}

const clientRoot = 'clients/wechat/assets/scripts';
const forbidden = [
  /from\s+['"]react(?:\/|['"])/,
  /from\s+['"]react-dom(?:\/|['"])/,
  /from\s+['"]react-router(?:\/|['"])/,
  /from\s+['"]phaser(?:\/|['"])/,
  /document\./,
  /window\./,
];

for (const rel of walk(clientRoot).filter((file) => /\.(ts|tsx)$/.test(file))) {
  const source = read(rel);
  for (const rule of forbidden) {
    if (rule.test(source)) failures.push(`forbidden Web runtime dependency in ${rel}: ${rule}`);
  }
}

const runtimeConfig = read('clients/wechat/assets/scripts/config/RuntimeConfig.ts');
if (runtimeConfig.includes("PRODUCTION_API_BASE_URL = 'https://yzdoc.cn'")) {
  warnings.push('production API defaults to https://yzdoc.cn; verify this is the real API/reverse-proxy origin before release');
}

if (failures.length) {
  console.error('[wechat:check] FAILED');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('[wechat:check] OK');
  for (const warning of warnings) console.warn(` - warning: ${warning}`);
}
