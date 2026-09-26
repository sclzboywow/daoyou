# WeChat Mini Game Baseline

## Fixed production baseline

- Repository: `sclzboywow/daoyou`
- Branch: `deploy/official-cutover-20260925`
- Production cutover commit: `4d656dfff5b6f9d1a402238061fb2b61e944b1c3`
- Absorbed official baseline: `5094bdf82e1b85b7980c787554a6d74293c8d7bc`
- Production Hono image at cutover: `daoyou-app:official-5094bdf8-20260926`
- WeChat V1 foundation commit: `8f8d7b481b02a7407764e7086e7e435b46b0bb4f`
- WeChat client stack: Cocos Creator `3.8.8` + TypeScript

## Current WeChat milestone

V1.1 builds on `8f8d7b48` and establishes the first runnable interoperability loop:

- Better Auth WeChat OpenID identity uses the same production user/character domain as Web.
- Database migration enforces one OpenID -> one user and one user -> one WeChat identity.
- `clients/wechat/assets/scenes/Main.scene` is the Cocos entry scene.
- Existing player flow: `wx.login` -> email OTP -> bind current OpenID -> same Better Auth `userId`.
- Game home reads `/api/player/resources` for the active cultivator and currency summary.
- Inventory reads the existing `/api/cultivator/inventory` resources.
- Realtime uses `/api/realtime` with Bearer auth and refreshes after `player-state.events`.
- Updating a cultivator title is the low-risk write-path smoke test for Web/WeChat shared data.

Character creation for brand-new accounts is deliberately not duplicated in V1.1. A new account may authenticate, but the character-creation UI remains a later client feature backed by the existing server workflow.

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

Database invariants are enforced by `drizzle-auth/0002_wechat_identity_uniqueness.sql`.

## Updating after future upstream absorption

The WeChat client follows **this repository's production baseline**, never ChurchTao/Daoyou directly.

For every new production baseline:

1. Record new self-repo production SHA and absorbed upstream SHA here.
2. Diff previous production baseline -> new production baseline.
3. Classify changes into API contract / new feature / presentation-only / server-rule-only.
4. Update WeChat only for API contract and required presentation changes.
5. Server-rule-only changes require no duplicated Cocos rule implementation.
6. Run `bun run wechat:check` and the normal test/build pipeline before release.
