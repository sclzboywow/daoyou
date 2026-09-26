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

function readJson(rel) {
  const raw = read(rel);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    failures.push(`invalid JSON: ${rel}: ${error instanceof Error ? error.message : error}`);
    return null;
  }
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

function compressUuid(uuid) {
  const hex = uuid.replaceAll('-', '');
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) return uuid;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = hex.slice(0, 5);
  for (let index = 5; index < hex.length; index += 3) {
    const a = Number.parseInt(hex[index], 16);
    const b = Number.parseInt(hex[index + 1], 16);
    const c = Number.parseInt(hex[index + 2], 16);
    out += chars[(a << 2) | (b >> 2)];
    out += chars[((b & 3) << 4) | c];
  }
  return out;
}

const baseline = read('WECHAT_BASELINE.md');
for (const marker of [
  '4d656dfff5b6',
  '5094bdf82e1b',
  '8f8d7b481b02',
  'Cocos Creator `3.8.8`',
]) {
  if (!baseline.includes(marker)) failures.push(`baseline marker missing: ${marker}`);
}

const auth = read('src/server/lib/auth/auth.ts');
if (!auth.includes('bearer()')) failures.push('Better Auth bearer plugin is not enabled');
if (!auth.includes('wechatMiniGameAuth()')) failures.push('WeChat auth plugin is not enabled');

const authHono = read('src/server/lib/auth/hono.ts');
if (!authHono.includes('x-wechat-login-code')) {
  failures.push('WeChat email-auth anti-abuse header is not handled');
}

const envExample = read('env/example.env');
for (const key of ['WECHAT_MINI_GAME_APP_ID=', 'WECHAT_MINI_GAME_APP_SECRET=']) {
  if (!envExample.includes(key)) failures.push(`env example missing ${key}`);
}

const migration = read('drizzle-auth/0003_wechat_identity_uniqueness.sql');
for (const marker of [
  'account_wechat_identity_uidx',
  'account_wechat_user_uidx',
  `WHERE "providerId" = 'wechat-mini-game'`,
  'GROUP BY "accountId"',
  'GROUP BY "userId"',
]) {
  if (!migration.includes(marker)) failures.push(`WeChat identity migration missing: ${marker}`);
}
const journal = read('drizzle-auth/meta/_journal.json');
if (!journal.includes('0003_wechat_identity_uniqueness')) {
  failures.push('Better Auth migration journal does not include WeChat uniqueness migration');
}
readJson('drizzle-auth/meta/0003_snapshot.json');

const cocosPackage = readJson('clients/wechat/package.json');
if (cocosPackage) {
  if (cocosPackage.creator?.version !== '3.8.8') {
    failures.push('Cocos client must remain on Creator 3.8.8 for this baseline');
  }
  if (!cocosPackage.uuid) failures.push('Cocos project package.json is missing uuid');
}
readJson('clients/wechat/settings/v2/packages/project.json');
readJson('clients/wechat/settings/v2/packages/builder.json');
const scene = read('clients/wechat/assets/scenes/Main.scene');
const sceneMeta = readJson('clients/wechat/assets/scenes/Main.scene.meta');
const appMeta = readJson('clients/wechat/assets/scripts/app/WechatAppRoot.ts.meta');
if (sceneMeta && !scene.includes(sceneMeta.uuid)) {
  failures.push('Main.scene does not reference its scene UUID');
}
if (appMeta) {
  const componentId = compressUuid(appMeta.uuid);
  if (!scene.includes(`"__type__": "${componentId}"`)) {
    failures.push('Main.scene is not wired to WechatAppRoot component UUID');
  }
}

const gameApi = read('clients/wechat/assets/scripts/game/GameApi.ts');
for (const endpoint of [
  '/api/player/resources',
  '/api/cultivator/inventory',
  '/api/cultivator/title',
]) {
  if (!gameApi.includes(endpoint)) failures.push(`V1.1 GameApi missing endpoint: ${endpoint}`);
}
const gameStore = read('clients/wechat/assets/scripts/game/GameStateStore.ts');
if (!gameStore.includes("event.type === 'player-state.events'")) {
  failures.push('V1.1 state store does not react to player-state.events');
}
const appRoot = read('clients/wechat/assets/scripts/app/WechatAppRoot.ts');
for (const marker of [
  '已有云梦界账号',
  '登录并绑定微信',
  '保存称号',
  "currentTab: 'home' | 'inventory'",
]) {
  if (!appRoot.includes(marker)) failures.push(`V1.1 app root missing flow marker: ${marker}`);
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
