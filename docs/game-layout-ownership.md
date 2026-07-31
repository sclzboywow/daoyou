# Game Layout Ownership

## `/game` 路由归属

- `GameGenesisLayout`：`/game/create`、`/game/reincarnate`
- `GameNarrativeLayout`：`/game/sect/onboarding`、`/game/identity-reshape` 等无 HUD、无全局导航的分幕演出
- `GameViewportLayout`：常规主流程页，包括 `/game`、`/game/inventory`、`/game/retreat`、`/game/cultivator`、`/game/skills`、`/game/techniques`、`/game/artifacts`、`/game/craft*`、`/game/enlightenment*`、`/game/fate-reshape`、`/game/market*`、`/game/auction`、`/game/mail`、`/game/world-chat`、`/game/community`、`/game/redeem`、`/game/settings/feedback`、`/game/rankings`、`/game/battle/history`、`/game/dungeon/history`、`/game/bet-battle`
- `GameActivityLayout`：`/game/sect/gate/sweep`、`/game/sect/spirit-vein/mining` 等无 HUD、无全局导航的全屏互动玩法
- `GameCombatLayout`：`/game/battle`、`/game/battle/challenge`、`/game/battle/:id`、`/game/bet-battle/challenge`、`/game/training-room`、宗门任务战斗
- `GameMapLayout`：`/game/map`
- `GameDungeonLayout`：`/game/dungeon`

## 共享组件归位

- 造化/参悟共享材料选择器放在 `src/react-app/components/feature/creation/MaterialSelector.tsx`
- 道身长期状态与称号编辑放在 `src/react-app/components/feature/cultivator/`
- 跨玩法复用的分幕演出舞台放在 `src/react-app/components/feature/narrative/`
- 清扫与采掘共用的横屏、全屏进入和释放逻辑放在 `src/react-app/lib/gameActivityImmersive.ts`；共享启动层和沉浸状态监听放在 `src/react-app/components/feature/game-activity/`
- 清扫摇杆使用 `phaser4-rex-plugins` 的 Virtual Joystick，并由清扫 Phaser runtime 持有、渲染和销毁；采掘放索按钮仍是玩法私有 DOM 控件。各玩法 runtime 与服务端重放规则保持独立
- PWA 安装状态由应用根 Provider 统一持有；小游戏只在全屏失败时给出场景化安装提示，系统设置保留固定安装入口
- PWA 安全区由顶层布局和共享固定层分别负责：背景与画布可以铺满系统区域，HUD、导航、正文和模态交互必须避让 `safe-area-inset-*`；不得给 `body` 统一增加 padding
- 冷启动壳由 `index.html` 提供首字节后的静态反馈，React Router 根路由使用同构的 `AppBootScreen` 承接懒加载与初始 loader 阶段
- `routes/game/components/` 只保留真正属于某个页面的私有组件；跨两个以上路由族复用的组件不得继续放在 `routes/**`

## 禁止项

- 游戏页面不得新增 `InkPageShell` 依赖
- `InkPageShell` 当前只允许 auth 流程通过 `AuthPageShell` 间接使用，不再属于游戏主流程布局组件
- `quickActionGroups`、`QuickActionsGrid`、`useHomeViewModel` 不再作为导航或首页编排来源
- `components/game-shell/immersiveSceneDescriptor.ts` 已废弃；副本或专属页需要私有 scene descriptor 时，放在对应路由族内部
