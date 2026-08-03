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
4. 强制检查 `web/index.html`、PWA 图标和 `server/index.js`。
5. 生成校验和、发布清单与本地后端镜像。

默认输出到：

```text
/home/ubuntu/daoyou-runtime/releases/<release-id>/
├── web/
├── server/
├── release.json
└── SHA256SUMS
```

## 发布

```bash
bash scripts/deploy-production-release.sh <release-id>
```

发布脚本会在切换前备份数据库、执行迁移并启动独立预检容器。随后原子切换游戏前端，使用本目录内受版本控制的 Compose 和 Nginx 配置重建服务，并检查首页、游戏、登录、图标和健康接口。

`/home/ubuntu/daoyou/dist-site` 是官网静态站的保留资产。其源码目前不在本仓库内；发布脚本只验证并只读挂载该目录，不会覆盖或删除它。

任何发布后检查失败都会恢复上一版游戏前端、Compose、Nginx 和镜像配置。数据库备份保留在 `/home/ubuntu/daoyou-runtime/backups/`。
