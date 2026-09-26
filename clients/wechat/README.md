# 云梦界微信小游戏客户端

此目录是 `sclzboywow/daoyou` 的微信小游戏独立客户端，基线见仓库根目录 `WECHAT_BASELINE.md`。

## V1.1 已完成

- Cocos Creator 3.8.8 + TypeScript 独立客户端。
- 可直接打开 `assets/scenes/Main.scene`，入口组件 `WechatAppRoot` 已挂载。
- 微信已绑定账号：`wx.login` 后自动使用 Bearer 进入游戏。
- 未绑定微信：明确选择“已有云梦界账号 / 新玩家”。
- 老玩家：邮箱 OTP 登录原 Better Auth 账号，再绑定当前 OpenID，继续使用原 `userId` 和原角色。
- 首页读取现有 `/api/player/resources`：角色、境界、灵气、灵石、声望、邮件、任务摘要。
- 背包读取现有 `/api/cultivator/inventory`，不复制服务器库存规则。
- `wx.connectSocket` 接现有 `/api/realtime`，收到 `player-state.events` 后刷新状态。
- 首页支持修改角色称号，作为 Web/微信共享生产数据的低风险写路径验证。

V1.1 **不复制角色创建逻辑**。新账号可以完成微信认证，但若没有活跃角色，客户端会明确提示；凝聚道生/角色创建是下一阶段接现有服务端流程。

## 固定原则

- 不复制 Web React/Tailwind/Phaser 页面。
- 游戏规则、掉落、经济、战斗、宗门、市场等仍由现有 Hono 服务端权威结算。
- 微信与 Web 使用同一 Better Auth `userId`、同一角色数据、同一 PostgreSQL/Redis/NATS。
- 老玩家必须先登录原账号再绑定当前微信，避免误建第二个角色。

## 打开工程

1. 安装 Cocos Creator **3.8.8**。
2. Dashboard 选择“打开项目”，目录指向 `clients/wechat`。
3. 打开 `assets/scenes/Main.scene`。
4. 预览或选择“微信小游戏”构建。

工程已包含：

```text
assets/scenes/Main.scene
settings/v2/packages/project.json
settings/v2/packages/builder.json
```

不再需要手工新建入口 Scene 或手工挂载 Bootstrap。

## 服务端部署前置

生产环境必须配置：

```env
WECHAT_MINI_GAME_APP_ID=...
WECHAT_MINI_GAME_APP_SECRET=...
```

并在发布包含 V1.1 的 Hono 镜像前执行 Better Auth migration：

```bash
bun run auth:migrate
```

`0002_wechat_identity_uniqueness.sql` 会先检查历史脏数据，然后建立两条数据库级约束：

- 同一 `wechat-mini-game` OpenID 只能绑定一个 Better Auth 用户。
- 同一 Better Auth 用户只能绑定一个 `wechat-mini-game` 身份。

若历史数据违反约束，migration 会主动失败，不会静默选一个账号。

## API 地址

默认生产地址仍为：

```text
https://yzdoc.cn
```

若实际 Hono `/api` 不在该域名，修改 `assets/scripts/config/RuntimeConfig.ts`。

开发者工具临时覆盖：

```js
wx.setStorageSync('daoyou:api-base-url', 'https://your-api.example.com')
```

清除覆盖：

```js
wx.removeStorageSync('daoyou:api-base-url')
```

## V1.1 验收

推荐使用一个已有 Web 角色测试：

1. 微信首次进入，选择“已有云梦界账号”。
2. 邮箱 OTP 登录并绑定。
3. 首页确认角色名、境界、灵石、灵气与 Web 一致。
4. 打开背包，确认材料/消耗品/法宝来自同一角色。
5. 微信修改一个 2–8 字称号，Web 刷新后应看到相同称号。
6. Web 再修改角色状态或产生资源事件，微信实时连接应收到 `player-state.events` 并自动刷新。

## 后续页面开发

所有新页面放 `assets/scripts/features/*`。优先复用服务端 API 和共享 DTO；不要把 `src/shared/engine/combat-v6` 整包复制到小游戏。地图、采矿、扫荡、占卜的 Phaser 表现层在微信端改为 Cocos Component，但服务端协议和结果保持一致。
