# 云梦界微信小游戏客户端

此目录是 `sclzboywow/daoyou` 的微信小游戏独立客户端，基线见仓库根目录 `WECHAT_BASELINE.md`。

## 固定原则

- Cocos Creator 3.8.8 + TypeScript，仅承担微信表现层和平台能力。
- 不复制 Web React/Tailwind/Phaser 页面。
- 游戏规则、掉落、经济、战斗、宗门、市场等仍由现有 Hono 服务端权威结算。
- 微信与 Web 使用同一 Better Auth `userId`、同一角色数据、同一 PostgreSQL/Redis/NATS。
- 老玩家先用邮箱 OTP 登录原账号，再绑定当前微信；新玩家才显式创建微信账号，避免误建第二个角色。

## 首次打开

1. 安装 Cocos Creator **3.8.8**，在 Dashboard 中直接打开本目录。
2. 新建一个 2D Scene，将 `assets/scripts/app/WechatBootstrap.ts` 挂到任意常驻节点。
3. 在 `assets/scripts/config/RuntimeConfig.ts` 确认生产 API 地址。如果服务器不是 `https://yzdoc.cn`，只改 `PRODUCTION_API_BASE_URL`。
4. 服务端生产环境增加：
   - `WECHAT_MINI_GAME_APP_ID`
   - `WECHAT_MINI_GAME_APP_SECRET`
5. 在微信公众平台配置 request/socket 合法域名，并在 Cocos 构建面板选择“微信小游戏”。

开发者工具临时切 API 地址可执行：

```js
wx.setStorageSync('daoyou:api-base-url', 'https://your-api.example.com')
```

清除覆盖：

```js
wx.removeStorageSync('daoyou:api-base-url')
```

## 登录状态机

`AuthFlow.tryWechatSignIn()`：

- 已绑定：直接返回 `signed-in`。
- 未绑定：返回 `unlinked`，UI 必须让用户选择“我是老玩家”或“我是新玩家”。
- 老玩家：`sendExistingAccountOtp` → `signInExistingAccount` → `bindCurrentWechatIdentity`。
- 新玩家：`registerNewWechatUser`。

不要在收到 `WECHAT_ACCOUNT_UNLINKED` 后自动创建新用户。

## 后续页面开发

所有新页面放 `assets/scripts/features/*`。优先复用服务端 API 和共享 DTO；不要把 `src/shared/engine/combat-v6` 整包复制到小游戏。地图、采矿、扫荡、占卜的 Phaser 表现层在微信端改为 Cocos Component，但服务端协议和结果保持一致。
