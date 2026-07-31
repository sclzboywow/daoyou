---
name: daoyou-data-layer
description: Daoyou PostgreSQL、Drizzle schema/migrations、repositories、transactions、Better Auth schema、Redis 半持久数据、creation_products、condition 和 consumables.spec 持久化指南。Use when modifying database schema, migrations, repositories, persistence mappers, Drizzle queries, transactions, Better Auth tables, Redis-backed state, or durable game data models in this repo.
---

# Daoyou Data Layer

## Read First

- `drizzle.config.ts`
- `drizzle.auth.config.ts`
- `src/server/lib/drizzle/db.ts`
- `src/server/lib/drizzle/schema.ts`
- `src/server/lib/auth/schema.ts`
- `src/server/lib/auth/auth.ts`
- `src/server/lib/repositories`
- `src/server/lib/services/consumablePersistence.ts`
- `src/shared/engine/creation-v2/persistence`
- Relevant migrations under `drizzle/`

## Core Facts

- The Drizzle entrypoints are `src/server/lib/drizzle/db.ts` and `src/server/lib/drizzle/schema.ts`.
- Do not create parallel `src/db` or `src/server/db` layers.
- The main Drizzle Kit config outputs to `drizzle/` and filters `wanjiedaoyou_*` business tables only.
- Better Auth uses the separate `drizzle.auth.config.ts` and `drizzle-auth/` migration stream. Its schema is fixed to `better_auth`, with independent migration history.
- Runtime database access shares one module-level Bun `SQL` pool and one Drizzle instance. `DATABASE_URL` is the only database environment variable; pool and PostgreSQL session settings are fixed in `src/server/lib/drizzle/db.ts`.
- Use `getExecutor(tx?)` and accept `DbExecutor` / `DbTransaction` when code may be called inside a transaction.
- Redis also stores important state: locks, market cache, world chat, rate limits, rankings, and temporary generation data.

## Durable Model Boundaries

- `cultivators.condition` is the current persistent state field. Do not restore old `persistent_state` or `persistent_statuses`.
- `consumables.spec` is the current consumable authority. Do not restore old `effects`, `use_spec`, or `details` columns.
- `wanjiedaoyou_creation_products` is the v2 creation product path for `skill | artifact | gongfa`.
- `product_model` stores slim JSON. `battleProjection` is removed before persistence and rebuilt during rehydrate.
- Equipped artifact state is `creation_products.is_equipped`; do not use `equipped_items` for new behavior.
- `battle_records_v2` is the current battle record path; `/api/battle-records/v2` and bet-battle settlement use it.
- Old tables such as `skills`, `artifacts`, `cultivation_techniques`, `equipped_items`, and `battle_records` still exist, but current runtime evidence shows new products use `creation_products` and battle logs use `battle_records_v2`.
- Legacy forget routes for old `skills` / `cultivation_techniques` delete old tables and do not handle new `creation_products`.
- `pre_heaven_fates.effects` is deprecated; current assembly reads `details.effects`.

## Workflow

1. Locate the owning model and current persistence path before changing schema.
2. For business tables, edit `src/server/lib/drizzle/schema.ts` and generate/apply Drizzle migrations.
3. For Better Auth schema changes, edit `src/server/lib/auth/schema.ts` and use `auth:generate` / `auth:migrate` instead of the main Drizzle flow.
4. Preserve transaction propagation by passing `tx` through repositories/services.
5. For JSONB models, update runtime validators/parsers together and verify them through lint/build and contract inspection.
6. Check Redis keys when behavior is cache, lock, ranking, market, or world-chat related.

## Do Not

- Do not add Better Auth tables to the main `wanjiedaoyou_*` migration stream.
- Do not persist `battleProjection` directly.
- Do not duplicate v2 creation storage with new product tables.
- Do not add new runtime reads/writes to old `skills`, `artifacts`, `cultivation_techniques`, `equipped_items`, or `battle_records` without proving a migration/compatibility need.
- Do not treat projected runtime arrays such as `cultivator.skills`, `cultivations`, or `inventory.artifacts` as proof that old same-name tables are authoritative.
- Do not write DB code that opens a fresh executor inside an existing transaction.
- Do not delete legacy tables or fields only because they look unused; verify call chains first.

## Verify

- Persistence changes: inspect query and transaction paths, then run lint/build; do not add repository/service/database tests.
- Schema changes: inspect generated migrations and `drizzle/meta/_journal.json`.
- Auth schema changes: inspect `drizzle-auth/`, run `auth:generate`, and verify it reports no unexpected schema differences.
- JSONB contract changes: inspect parser/mapper call paths and run build.
