# yzdoc.cn 源码发布

生产发布不再复用上一次构建目录，也不直接复制混合的 `dist`。

## 构建

```bash
bash scripts/build-production-release.sh <release-id>
```

构建脚本会：

1. 按 `bun.lock` 安装依赖并执行 ESLint。
2. 从 `src/react-app` 构建前端，立即封存到独立的 `web` 目录。
3. 从 `src/index.ts` 构建后端，封存到独立的 `server` 目录。
4. 构建独立的实时战斗服务，封存到 `battle` 目录。
5. 强制检查前端、后端及战斗服务产物。
6. 生成校验和、发布清单与两个运行时镜像。

默认输出到：

```text
/home/ubuntu/daoyou-runtime/releases/<release-id>/
├── web/
├── server/
├── battle/
├── release.json
└── SHA256SUMS
```

## 发布

```bash
bash scripts/deploy-production-release.sh <release-id>
```

发布脚本会在切换前备份数据库、执行迁移并启动独立预检容器。随后原子切换游戏前端，使用本目录内受版本控制的 Compose 和 Nginx 配置重建主应用、实时战斗服务与网站，并检查首页、游戏、登录、图标、Socket.IO 和健康接口。

切换时会保留当前版本的哈希静态资源，避免已经打开游戏的用户在更新后加载旧懒加载模块时遇到 404 或白屏；同名新文件不会被旧文件覆盖。

`/home/ubuntu/daoyou/dist-site` 是官网静态站的保留资产。其源码目前不在本仓库内；发布脚本只验证并只读挂载该目录，不会覆盖或删除它。

任何发布后检查失败都会恢复上一版游戏前端、Compose、Nginx 和镜像配置。数据库备份保留在 `/home/ubuntu/daoyou-runtime/backups/`。

宿主机的每日数据库备份、证书续期和健康监控脚本也保存在仓库的 `scripts/` 中。生产 crontab 必须从稳定源码目录 `/home/ubuntu/daoyou-integrated` 调用这些脚本，不得指向会随静态资源切换而替换的 `/home/ubuntu/daoyou`。
