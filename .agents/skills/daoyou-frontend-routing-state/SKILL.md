---
name: daoyou-frontend-routing-state
description: Daoyou React Router、game scene metadata、layout selection、frontend hooks/cache/context、admin UI 与共享组件归属指南。Use when adding or changing React routes, route loaders, route handles, game scene ids, dock navigation, document titles, frontend data hooks, Player/Cultivator/Auth providers, admin pages, or reusable UI/component placement in this repo.
---

# Daoyou Frontend Routing State

## Read First

- `src/react-app/router.tsx`
- `src/react-app/layouts/game-layout.tsx`
- `src/react-app/components/game-shell/gameNavigation.ts`
- `src/react-app/lib/router`
- `src/react-app/lib/hooks/useCultivatorBundle.ts`
- `src/react-app/lib/player`
- `src/react-app/lib/auth`
- `src/react-app/components/providers`
- `docs/game-layout-ownership.md`
- `.agents/skills/daoyou-game-ui/SKILL.md` for main game UI

## Routing Facts

- React Router routes are centralized in `src/react-app/router.tsx` and loaded with `lazyRoute`.
- Game scenes use `handle={scene(...)}`. The scene id must exist in `src/react-app/components/game-shell/gameNavigation.ts`; otherwise `scene()` throws.
- Game layouts are distinct:
  - `GameGenesisLayout` for create/reincarnate.
  - `GameViewportLayout` for main workflow scenes.
  - `GameCombatLayout` for battle/training flows.
  - `GameMapLayout` for map.
  - `GameDungeonLayout` for dungeon.
- `GameViewportLayout` owns top HUD, outlet, world chat preview, bottom dock, and bottom offset calculation.
- Admin and auth pages are not governed by `daoyou-game-ui` unless a user explicitly asks to align them.

## State Facts

- There is no central `stores/` directory.
- State is mostly React Context, hooks, and module-level caches.
- `useCultivatorBundle` owns cached player/cultivator/inventory/mail state and exposes targeted refresh methods such as `refreshInventory`, `ensureInventoryLoaded`, `refreshCultivator`, and `refreshUnreadMailCount`.
- `PlayerProvider` wraps game user/character state.
- `InkUIProvider` provides toast/dialog.
- `WorldChatFeedProvider` is mounted inside `GameViewportLayout`.
- `fetchJsonCached` in `src/react-app/lib/client/requestCache.ts` is a short TTL read cache; write flows must invalidate affected keys when they use it.
- Task lists use `useTaskList` and require explicit reload after task mutations.

## Component Placement

- Cross-route reusable UI belongs in `src/react-app/components/feature/**`, `src/react-app/components/ui/**`, or `src/react-app/components/game-shell/**`.
- `src/react-app/routes/game/**/components` should stay page-private.
- Existing shared examples include `src/react-app/components/feature/creation/MaterialSelector.tsx`, `src/react-app/components/feature/cultivator`, `src/react-app/components/feature/products`, and `src/react-app/components/feature/world-chat`.

## Workflow

1. For a new route, choose the correct layout before writing UI.
2. Add route metadata and document title in `src/react-app/router.tsx`.
3. For game scenes, update `src/react-app/components/game-shell/gameNavigation.ts` scene registry/dock information if needed.
4. For `chrome: "immersive"` scenes, check `src/react-app/layouts/game-layout.tsx` special scene back descriptor.
5. For admin routes, update `src/react-app/router.tsx`, the route module, and `src/react-app/routes/admin/_config/nav.ts` when the page should appear in navigation.
6. Check `src/react-app/lib/router/gameShellRegistry.ts` and `src/react-app/lib/router/routeTitle.ts`.
7. Reuse existing hooks/providers before creating new page-level fetching state.
8. For `GameViewportLayout` pages, load and follow `daoyou-game-ui`.

## Mutation Refresh Checklist

- Character/global state changed: call `refresh()` or `refreshCultivator()` through the player/cultivator hook path.
- Inventory-only mutation: call `refreshInventory()`, `ensureInventoryLoaded()`, page `refreshPage()`, or the owning paginated hook refresh.
- Mail unread count changed: call `refreshUnreadMailCount()`.
- Task state changed: call the task hook `reload()`.
- `fetchJsonCached` read model affected: call `invalidateCachedRequest()` for the exact key.

## Do Not

- Do not add `InkPageShell` to game routes.
- Do not put global navigation back into main scene body; use the dock/navigation model.
- Do not duplicate full cultivator/inventory/HUD fetch state inside individual pages.
- Do not treat admin UI as a game scene or apply main-flow scene rules blindly.

## Verify

- Route metadata: run lint/build and inspect titles, scene registration, and navigation manually.
- Hooks/cache: run lint/build and inspect invalidation/refresh behavior manually.
- Main game UI: follow the validation in `daoyou-game-ui`.
