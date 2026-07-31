# 万界道友 · 自托管说明

访问地址：https://yzdoc.cn/（根路径为镜像官网，游戏入口 `/game`）

## 目录

- 项目：`/home/ubuntu/daoyou`
- 运行配置：`.env.production`
- Compose：`docker-compose.selfhost.yml`

## 常用命令

```bash
cd /home/ubuntu/daoyou
docker compose --env-file .env.compose -f docker-compose.selfhost.yml ps
docker compose --env-file .env.compose -f docker-compose.selfhost.yml logs -f app
docker compose --env-file .env.compose -f docker-compose.selfhost.yml restart
```

## 必填配置（编辑后重启 app）

编辑 `.env.production`：

1. `DEEPSEEK_API_KEY`（或改用其它 AI Provider）
2. SMTP（注册/验证码邮件必需）：`SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM`
3. 可选：`ADMIN_EMAILS=你的邮箱`

```bash
docker compose --env-file .env.compose -f docker-compose.selfhost.yml up -d app
```

## 腾讯云安全组

本机 UFW 已放行 80。若公网打不开，请在腾讯云控制台安全组放行入站 TCP 80。
