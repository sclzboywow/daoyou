---
name: daoyou-condition-alchemy-market
description: Daoyou condition 持久状态、丹药/炼丹、ConditionOperation、PillSpec、alchemy services、market listings/recycle、资源与交易一致性指南。Use when modifying condition, hp/mp current state, pill toxicity, tempering/marrow tracks, consumable specs, alchemy formulas/crafting, market refresh/buy/recycle, or market/alchemy flows that call manual draw. For standalone manual draw config/rules, use daoyou-game-core-domain.
---

# Daoyou Condition Alchemy Market

## Read First

- `docs/condition-pill-alchemy-redesign.md`
- `docs/market-redesign.md`
- `src/shared/types/condition.ts`
- `src/shared/lib/condition.ts`
- `src/shared/lib/conditionStatusRegistry.ts`
- `src/shared/types/consumable.ts`
- `src/shared/config/alchemyConfig.ts`
- `src/shared/config/consumableSystem.ts`
- `src/shared/config/marketConfig.ts`
- `src/shared/types/market.ts`
- `src/server/lib/services/ConditionService.ts`
- `src/server/lib/services/PillOperationExecutor.ts`
- `src/server/lib/services/alchemyServiceV2.ts`
- `src/server/lib/services/AlchemyFormulaService.ts`
- `src/server/lib/services/MarketService.ts`
- `src/server/lib/services/MarketRecycleService.ts`
- `src/server/lib/services/MarketScheduler.ts`

For standalone manual draw probability, quality floor, or guarantee rules, use `daoyou-game-core-domain`. Use this skill only when manual draw is part of a market, alchemy, transaction, or resource flow.

## Condition Facts

- `condition` is persistent cultivator state, not battle buff state.
- It includes current hp/mp, pill toxicity, tempering/marrow tracks, counters, statuses, timestamps, and metrics.
- Derived display labels and percentages should be computed, not persisted.
- Use shared condition types/lib and server `ConditionService`/`PillOperationExecutor` rather than ad hoc JSON mutation.

## Consumable And Alchemy Facts

- Consumables use `consumables.spec` with parsed `ConsumableSpec` / `PillSpec`.
- Do not restore old `effects`, `use_spec`, or `details` persistence.
- Runtime parsing rejects old consumables without a valid `spec.kind`; old data needs cleanup/migration, not a new compatibility layer.
- Alchemy shared config defines material types, quality potency, toxicity/stability, and element naming hints.
- Actual alchemy behavior lives in server services, especially `alchemyServiceV2*`, `AlchemyFormulaService*`, `AlchemyRecipePlanner`, and `AlchemyRecipeRules`.
- LLM may help narrative/planning, but game-state numeric effects require schema bounds and service-layer validation.

## Market Facts

- Market shared types/config define layers, DTOs, refresh policy, mystery payloads, sell preview/confirm contracts.
- Current market direction is shared listing cache plus per-user bought set, not per-user generated shelves.
- `common` and `treasure` are preset-oriented layers; `heaven` and `black` use LLM generation.
- Market runtime behavior is in server services, not only shared config.
- Recycle pricing has an explicit cap lower than production minimum price factor; do not copy or invent pricing formulas in UI.
- Market refresh has a cron job and an internal route.

## Workflow

1. Determine whether the change is shared config/type, server service, repository/persistence, or UI presentation.
2. For condition updates, use operation/service paths and check persistence shape.
3. For alchemy changes, inspect both shared config and server service behavior.
4. For market changes, inspect service and Redis/cache behavior.
5. For LLM-influenced outputs, validate semantic bounds before state changes.
6. Add or update tests only when the affected logic is a pure, reusable shared engine rule.

## Do Not

- Do not treat condition statuses as battle-v5 buffs.
- Do not write legacy material `details` for alchemy metadata unless current code explicitly requires it.
- Do not duplicate manual draw or market pricing logic in UI/API.
- Do not let LLM decide trusted economy numbers without deterministic validation.
- Do not update shared DTOs without checking server route consumers and frontend clients.

## Verify

- Condition/pill changes: run lint/build and inspect service/persistence behavior; run tests only for eligible pure shared engine rules.
- Alchemy changes: run lint/build and focused manual/runtime checks; do not add server service or route tests.
- Market changes: run lint/build and focused manual/runtime checks; do not add server service, Redis, or route tests.
- Manual draw changes: run eligible pure shared-rule tests when present.
