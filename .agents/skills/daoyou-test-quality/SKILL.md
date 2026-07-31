---
name: daoyou-test-quality
description: Daoyou 纯共享引擎单元测试、lint、typecheck、Vitest、ESLint、质量验证与失败排障 companion skill。Use when adding or fixing eligible src/shared engine tests, selecting non-test verification for frontend/backend/infrastructure changes, changing Vitest/ESLint/TypeScript config, debugging test failures, or deciding how to validate changes after using the owning domain skill.
---

# Daoyou Test Quality

This is a companion skill for choosing and running verification. For code changes, first use the domain skill that owns the code area, then use this skill to select tests and checks.

## Read First

- `package.json`
- `vitest.config.ts`
- `eslint.config.js`
- `tsconfig.json`
- `tsconfig.app.json`
- `tsconfig.node.json`
- For eligible shared engine logic, the nearest `src/shared/**/*.test.ts` files

## Commands

```bash
bun run lint
bun run test
bun run build
bun run check
```

Targeted Vitest examples:

```bash
bunx vitest run src/shared/engine/battle-v5/tests
bunx vitest run src/shared/engine/creation-v2/tests
```

## Project Test Facts

- Vitest uses `environment: "node"`, `globals: true`, and `restoreMocks: true`.
- Test include patterns are restricted to `src/shared/**/*.test.ts`, `src/shared/**/*.spec.ts`, `src/shared/**/*.test.tsx`, and `src/shared/**/*.spec.tsx`.
- `bun run build` does not run tests; it runs TypeScript project build plus Vite builds.
- ESLint flat config relaxes `no-explicit-any` and `no-unused-vars` for tests and `__mocks__`.
- `tsconfig.app.json` excludes tests; `tsconfig.node.json` includes server, scripts, Vite, and Vitest config.
- There is no jsdom config because React/UI unit tests are not allowed.

## Test Boundary

- Do not add unit tests under `src/react-app` or `src/server`.
- Add new unit tests only for pure, deterministic, reusable engine/domain logic under `src/shared`.
- Do not test or mock databases, repositories, Hono routes, auth, Redis, LLM/SMTP providers, network APIs, or other third-party services.
- Keep eligible tests independent of process environment, filesystem, network, clocks, and external infrastructure.

## Verification Selection

- Shared engine or rules: run the nearest shared tests, then `bun run test` if behavior is broad.
- Hono route, middleware, service, auth, Redis, or provider code: use lint/build, code inspection, and focused manual/runtime checks; do not add unit tests.
- Drizzle schema or persistence: inspect migrations and transaction boundaries, then run lint/build; do not add database/repository tests.
- UI routing/layout/hooks: use lint/build and focused browser/manual checks; do not add frontend unit tests.
- LLM provider security: inspect allowlist and validation paths, then run lint/build and focused runtime checks without provider tests.
- Build or env config: run `bun run build`.
- Docs/skills only: inspect Markdown and `git diff`; full app tests are usually unnecessary.

## Test Patterns To Reuse

- Prefer table-driven tests for pure shared rules and formulas.
- Use deterministic fixtures and inject random sources when an engine supports randomness.
- Shared engine logic often already has focused tests under `src/shared/engine/**/tests`.

## Do Not

- Do not assume GitHub Actions is a quality gate; current workflow only builds and pushes an image.
- Do not add DOM, component, hook, route, middleware, service, repository, database, Redis, or provider tests.
- Do not use mocks to disguise infrastructure-coupled code as a unit test.
- Do not replace focused tests with only full-suite runs.
- Do not delete or weaken existing tests for unrelated dirty worktree changes.

## Verify

Always report which commands ran and which did not. If tests are skipped because the change is documentation-only, say that explicitly.
