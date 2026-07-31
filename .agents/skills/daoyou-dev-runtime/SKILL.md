---
name: daoyou-dev-runtime
description: Daoyou 本地开发、环境变量、构建、Docker、compose、cron 和部署脚本操作指南。Use when starting the app, debugging build/dev-server/runtime failures, changing package scripts, Dockerfile, docker-compose, Vite build config, environment variables, health checks, cron jobs, or deployment scripts in this repo.
---

# Daoyou Dev Runtime

## Read First

- `README.md`
- `package.json`
- `vite.config.ts`
- `src/index.ts`
- `src/server/app.ts`
- `src/server/lib/jobs/internalCronScheduler.ts`
- `Dockerfile`
- `docker-compose.yml`
- `scripts/start-local.sh`
- `scripts/deploy-local.sh`
- `scripts/deploy-compose.sh`
- `.github/workflows/deploy.yml`

## Core Facts

- This repo is `Hono + React SPA`, not Next.js or SSR.
- Use Bun. The repo has `bun.lock` and scripts use `bun` / `bunx`; do not introduce npm/yarn/pnpm lockfiles.
- `bun run build` is intentionally two-stage: `tsc -b && vite build --mode client && vite build`.
- Vite `mode === "client"` writes the SPA to `dist` with `emptyOutDir: true`; the server build uses `@hono/vite-build/bun`, entry `src/index.ts`, and `emptyOutDir: false`.
- Production `src/index.ts` serves SPA fallback only for non-API, non-internal, non-static `GET/HEAD` requests.
- `VITE_TURNSTILE_SITE_KEY` is a frontend build-time value, including in Docker builds.
- Health check is `/api/health-check`; Redis down returns 503, missing Redis returns `redis: disabled`.
- Production Bun cron jobs currently include `auction-expire`, `bet-battle-expire`, `rank-rewards`, and `market-refresh`.
- Compose runs only the app container. PostgreSQL, Redis, SMTP, and reverse proxy are external dependencies supplied by env/service infrastructure.
- GitHub Actions currently builds and pushes a Docker image; it does not SSH deploy and does not run lint/test as a separate quality gate.

## Common Commands

```bash
bun install
cp .env.example .env.local
bunx drizzle-kit migrate
bun run auth:migrate
bun run dev
bun run build
bun run preview
bun run start
```

Docker:

```bash
docker build -t daoyou-hono-bun:local --build-arg VITE_TURNSTILE_SITE_KEY=your-public-site-key -f Dockerfile .
ENV_FILE=/path/to/.env.production ./scripts/start-local.sh
ENV_FILE=/path/to/.env.production ./scripts/deploy-local.sh
docker compose up -d
```

## Workflow

1. Identify whether the issue is dev-server, client build, server build, runtime env, database, Redis, Docker, or cron.
2. Check the relevant config before editing:
   - Vite/dev/build: `vite.config.ts`
   - runtime fallback and cron registration: `src/index.ts`
   - API app wiring: `src/server/app.ts`
   - Docker/compose: `Dockerfile`, `docker-compose.yml`, `scripts/`
3. Preserve the two-stage build unless you also verify `dist/index.html` and `dist/index.js`.
4. When changing env variables, update `.env.example` and README only if the variable is real in code.
5. When changing cron jobs, update both `src/server/lib/jobs/internalCronScheduler.ts` and `src/server/routes/internal/cron.router.ts` if the job should also be manually triggerable.
6. For Redis-backed jobs, keep Redis token locks and TTLs; do not replace them with in-memory locks.

## Do Not

- Do not use Next.js/SSR assumptions for routing or server rendering.
- Do not make production SPA fallback swallow `/api/*`, `/internal/*`, or static file requests.
- Do not move frontend build-time variables into runtime-only Docker env and expect the client bundle to see them.
- Do not assume GitHub Actions runs lint/test; current workflow only builds and pushes Docker image on `master`.
- Do not assume `docker-compose.yml` provisions dependencies; it only runs the app.
- Do not run both external HTTP cron and Bun cron without understanding duplicate scheduling. Redis locks prevent concurrent execution, but they are not a deployment policy.

## Verify

- Config-only or docs-only: inspect `git diff`.
- Runtime/build changes: run `bun run build`.
- Dev-server changes: run `bun run dev` and hit `/api/health-check`.
- Docker changes: build locally or inspect the exact script affected.
- Cron changes: run lint/build and verify `CRON_SECRET` behavior with focused runtime checks; do not add server unit tests.
