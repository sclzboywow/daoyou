# 微信小游戏第一大阶段

基线：`sclzboywow/daoyou@937156743e54b5e869164b0c46ef19fd5e94a77f`

## 本阶段边界

本阶段目标是让微信端形成完整的新手与日常入口，而不是复制 Web 页面。

已接入：

- 微信自动登录、已有账号邮箱 OTP 绑定、新账号创建
- 凝聚道生：角色推演、气运重抽、选择 3 个气运、正式入世
- 洞府首页与资源摘要
- 角色页及新版六维“基础值 + 构筑加成 = 有效值”
- 随身背包读取，丹药单颗/批量服用
- 任务列表与已完成任务奖励领取
- 收件玉简：读取、全部已读、单封/一键领取附件
- 主线 Story performance 的 Cocos 文本演出
- 洞府教学；其他依赖炼丹/地图/灵兽/炼器/宗门的 practice beat 不伪造完成
- `/api/realtime` 继续负责跨 Web/微信资源变更通知

未在第一阶段实现：

- Combat V6 战斗表现与“战意”条
- 炼丹、炼器、宗门、地图、野外、灵兽等核心玩法页面
- 玩家主动发送传音等 UGC 输入入口
- 微信广告、分享、订阅消息、内容安全与游戏圈

这些进入第二、第三大阶段。

## Better Auth 1.7.4

`0002_account_issuer.sql` 对应 Better Auth 1.7.0–1.7.2 的短暂账号模型。当前项目已使用 1.7.4，因此必须继续执行 `0004_better_auth_issuer_cleanup.sql`，否则 `issuer NOT NULL` 可能拒绝新账号或微信身份绑定。

部署前：

```bash
bun run auth:migrate
bun run wechat:check
bun test
bun run build
```

然后使用 Cocos Creator 3.8.8 打开 `clients/wechat`，从现有 `assets/scenes/Main.scene` 构建微信小游戏。
