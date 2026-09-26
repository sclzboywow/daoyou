# WeChat Mini Game Baseline

## Fixed production baseline

- Repository: `sclzboywow/daoyou`
- Branch: `deploy/official-cutover-20260925`
- Production cutover commit: `4d656dfff5b6f9d1a402238061fb2b61e944b1c3`
- Current self-repo baseline: `937156743e54b5e869164b0c46ef19fd5e94a77f`
- Absorbed official baseline: `43ed39fb0ed3f0a7976d0008ffae734f59355126`
- Previous absorbed official baseline: `5094bdf82e1b85b7980c787554a6d74293c8d7bc`
- Production Hono image at cutover: `daoyou-app:official-5094bdf8-20260926`
- WeChat V1 foundation commit: `8f8d7b481b02a7407764e7086e7e435b46b0bb4f`
- WeChat V1.1 interoperability commit: `ebee6ef37d9de19056a7fe33a661aadfe643865c`
- WeChat client stack: Cocos Creator `3.8.8` + TypeScript

## Current WeChat milestone

The first large WeChat frontend stage builds on `93715674` and keeps Web/WeChat in the same game world.

Delivered in the foundation before this stage:

- Better Auth WeChat OpenID identity uses the same production user/character domain as Web.
- Database migration enforces one OpenID -> one user and one user -> one WeChat identity.
- `clients/wechat/assets/scenes/Main.scene` is the Cocos entry scene.
- Existing player flow: `wx.login` -> email OTP -> bind current OpenID -> same Better Auth `userId`.
- Game home reads `/api/player/resources` for the active cultivator and currency summary.
- Realtime uses `/api/realtime` with Bearer auth and refreshes after `player-state.events`.

First-stage frontend scope on `93715674`:

- Brand-new WeChat accounts can run the existing server-authoritative `generate-character -> generate-fates -> save-character` flow.
- Reusable Cocos Ink UI primitives are used for panels, text, inputs, buttons, cards, notices and navigation.
- Main navigation covers cave/home, character, inventory, tasks and mail.
- Character page follows the current upstream six-attribute contract: base value + build bonus = effective value.
- Inventory follows the current upstream contract: manual stack splitting is removed; pills may be consumed in batches through `/api/cultivator/consume`.
- Tasks and reward claiming use the existing `/api/tasks` endpoints.
- Mail supports reading and reward claiming; player-to-player UGC composition remains deferred until the WeChat content-safety stage.
- Story performances are served by the existing server content catalog through a small read endpoint, then completed through the existing authoritative story mutation endpoint.
- Story practice beats that depend on second-stage gameplay are shown honestly and are not auto-completed.

## Better Auth 1.7 account-schema note

This repository uses Better Auth `1.7.4`.

Better Auth `1.7.0` through `1.7.2` temporarily required `account.issuer`, but `1.7.3+` reverted account identity to `(providerId, accountId)`. Because `0002_account_issuer.sql` may already have run in an environment, `drizzle-auth/0004_better_auth_issuer_cleanup.sql` removes the transitional issuer index/column before WeChat account creation and linking are treated as production-ready.

Do **not** re-add a required `issuer` field to the Drizzle account schema while Better Auth remains on 1.7.4.

## Architecture contract

The WeChat client is an independent presentation/platform client, not a second game world.

Shared with Web:

- Better Auth users and active cultivator identity
- PostgreSQL game data
- Redis locks/cache/cooldowns
- NATS Core/JetStream events
- Hono game API and server-authoritative rules

Isolated for WeChat:

- Cocos client source/build/release
- `wx.*` platform adapter
- OpenID identity binding
- WeChat ads/share/subscription/content-safety integrations

Do not deploy a second game database for the WeChat client if Web/WeChat character data must interoperate.

## Identity rules

Provider id: `wechat-mini-game`

Account id format:

```text
<WECHAT_MINI_GAME_APP_ID>:<openid>
```

First launch must not silently create a second game account. The client first calls `/api/auth/sign-in/wechat-mini-game`:

- linked identity -> sign in
- unlinked identity -> UI asks old player vs new player
- old player -> email OTP sign-in, then `/api/auth/link/wechat-mini-game`
- new player -> explicit `/api/auth/sign-up/wechat-mini-game`

Database WeChat identity invariants are enforced by `drizzle-auth/0003_wechat_identity_uniqueness.sql`.
Better Auth's transitional issuer migration is cleaned by `drizzle-auth/0004_better_auth_issuer_cleanup.sql`.

## Updating after future upstream absorption

The WeChat client follows **this repository's production baseline**, never ChurchTao/Daoyou directly.

For every new production baseline:

1. Record new self-repo production SHA and absorbed upstream SHA here.
2. Diff previous production baseline -> new production baseline.
3. Classify changes into API contract / new feature / presentation-only / server-rule-only.
4. Update WeChat only for API contract and required presentation changes.
5. Server-rule-only changes require no duplicated Cocos rule implementation.
6. Run `bun run wechat:check` and the normal test/build pipeline before release.
