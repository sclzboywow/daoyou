import App, { RootRouteErrorBoundary } from '@app/App';
import { AppBootScreen } from '@app/components/feature/app-boot/AppBootScreen';
import { getGameSceneMeta } from '@app/components/game-shell/gameNavigation';
import {
  GameActivityLayout,
  GameCombatLayout,
  GameDungeonLayout,
  GameGenesisLayout,
  GameMapLayout,
  GameNarrativeLayout,
  GameViewportLayout,
  PlayerShellLayout,
} from '@app/layouts/game-layout';
import { lazyRoute } from '@app/lib/router/lazyRoute';
import { AUTH_LAYOUT_ROUTE_ID, GAME_ROUTE_ID } from '@app/lib/router/routeData';
import type {
  AppRouteHandle,
  GameSceneHandle,
  RouteTitleResolver,
} from '@app/lib/router/routeTitle';
import { resolveSectVisitTitle } from '@app/lib/router/routeTitle';
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
} from 'react-router';

const title = (value: RouteTitleResolver): AppRouteHandle => ({ title: value });
const scene = (
  sceneHandle: Pick<GameSceneHandle, 'id'> &
    Partial<
      Pick<GameSceneHandle, 'chrome' | 'dock' | 'presentation' | 'summary'>
    >,
  value: RouteTitleResolver,
): AppRouteHandle => {
  const chrome = sceneHandle.chrome ?? 'standard';
  const meta = getGameSceneMeta(sceneHandle.id);

  if (!meta) {
    throw new Error(`Missing game scene metadata for "${sceneHandle.id}"`);
  }

  return {
    title: value,
    gameScene: {
      id: meta.id,
      label: meta.label,
      group: meta.group,
      chrome,
      dock: sceneHandle.dock ?? 'core',
      presentation:
        sceneHandle.presentation ??
        (chrome === 'immersive' ? 'immersive' : 'workflow'),
      summary: sceneHandle.summary ?? null,
    },
  };
};

const mapTitle: RouteTitleResolver = ({ searchParams }) =>
  searchParams.get('intent') === 'market'
    ? '修仙界地图 · 坊市选址'
    : searchParams.get('intent') === 'sect'
      ? '修仙界地图 · 诸宗山门'
      : '修仙界地图 · 历练选址';

const sectVisitTitle: RouteTitleResolver = ({ params }) => {
  return resolveSectVisitTitle(params.sectId);
};

export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route
      element={<App />}
      errorElement={<RootRouteErrorBoundary />}
      HydrateFallback={AppBootScreen}
    >
      <Route index lazy={lazyRoute(() => import('@app/routes/index/route'))} />
      <Route
        path="/battle-replay/:shareCode"
        lazy={lazyRoute(() => import('@app/routes/battle-replay/route'))}
        handle={title('公开战谱')}
      />
      <Route
        id={AUTH_LAYOUT_ROUTE_ID}
        lazy={lazyRoute(() => import('@app/routes/auth/layout'))}
      >
        <Route
          path="/login"
          lazy={lazyRoute(() => import('@app/routes/login/route'))}
          handle={title('【登录】')}
        />
        <Route
          path="/login/email"
          lazy={lazyRoute(() => import('@app/routes/login/email/route'))}
          handle={title('【邮箱验证码】')}
        />
        <Route
          path="/login/password"
          lazy={lazyRoute(() => import('@app/routes/login/password/route'))}
          handle={title('【密码登录】')}
        />
        <Route
          path="/login/verify"
          lazy={lazyRoute(() => import('@app/routes/login/verify/route'))}
          handle={title('【验证码验证】')}
        />
        <Route
          path="/signup"
          lazy={lazyRoute(() => import('@app/routes/signup/route'))}
          handle={title('【注册】')}
        />
        <Route
          path="/signup/password"
          lazy={lazyRoute(() => import('@app/routes/signup/password/route'))}
          handle={title('【密码注册】')}
        />
        <Route
          path="/forgot-password"
          lazy={lazyRoute(() => import('@app/routes/forgot-password/route'))}
          handle={title('【找回密码】')}
        />
        <Route
          path="/reset-password"
          lazy={lazyRoute(() => import('@app/routes/reset-password/route'))}
          handle={title('【重设密码】')}
        />
      </Route>
      <Route
        id={GAME_ROUTE_ID}
        path="/game"
        lazy={lazyRoute(() => import('@app/routes/game/layout'))}
      >
        <Route element={<GameGenesisLayout />}>
          <Route
            path="create"
            lazy={lazyRoute(() => import('@app/routes/game/create/route'))}
            handle={title('凝气篇')}
          />
          <Route
            path="reincarnate"
            lazy={lazyRoute(() => import('@app/routes/game/reincarnate/route'))}
            handle={title('转世重修')}
          />
        </Route>

        <Route element={<PlayerShellLayout />}>
          <Route element={<GameNarrativeLayout />}>
            <Route
              path="identity-reshape"
              lazy={lazyRoute(
                () => import('@app/routes/game/identity-reshape/route'),
              )}
              handle={scene(
                {
                  id: 'identity-reshape',
                  chrome: 'immersive',
                  dock: 'hidden',
                },
                '改天换地',
              )}
            />
            <Route
              path="sect/onboarding"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/onboarding/route'),
              )}
              handle={scene(
                {
                  id: 'sect-onboarding',
                  chrome: 'immersive',
                  dock: 'hidden',
                },
                '诸宗山门',
              )}
            />
          </Route>

          <Route element={<GameViewportLayout />}>
            <Route
              index
              lazy={lazyRoute(() => import('@app/routes/game/route'))}
              handle={scene(
                {
                  id: 'cave',
                  presentation: 'hub',
                  summary:
                    '石门半掩，纸窗透白。丹火、经卷、器架与玉简都安放在各自的位置',
                },
                '洞府',
              )}
            />
            <Route
              path="cultivator"
              lazy={lazyRoute(
                () => import('@app/routes/game/cultivator/route'),
              )}
              handle={scene(
                {
                  id: 'cultivator',
                  presentation: 'archive',
                  summary: '名号、命格、根基与所修皆在此归卷。',
                },
                '道身',
              )}
            />
            <Route
              path="cultivator/attributes"
              lazy={lazyRoute(
                () => import('@app/routes/game/cultivator/attributes/route'),
              )}
              handle={scene(
                {
                  id: 'cultivator-attributes',
                  presentation: 'archive',
                  summary: '六维根基、次级属性与可分配点在此处归档。',
                },
                '根基属性',
              )}
            />
            <Route
              path="body-cultivation"
              lazy={lazyRoute(
                () => import('@app/routes/game/body-cultivation/route'),
              )}
              handle={scene(
                {
                  id: 'body-cultivation',
                  summary: '五轨炼体等级、当前收益与进阶准备归于此处。',
                },
                '肉身炼体',
              )}
            />
            <Route
              path="body-cultivation/breakthrough"
              lazy={lazyRoute(
                () =>
                  import('@app/routes/game/body-cultivation/breakthrough/route'),
              )}
              handle={scene(
                {
                  id: 'body-cultivation',
                  summary: '五轨炼体等级、当前收益与进阶准备归于此处。',
                },
                '肉身破限',
              )}
            />
            <Route
              path="marrow-wash"
              lazy={lazyRoute(
                () => import('@app/routes/game/marrow-wash/route'),
              )}
              handle={scene(
                {
                  id: 'marrow-wash',
                  summary: '洗髓进度、自由属性点与后天灵根加成归于此处。',
                },
                '洗髓池',
              )}
            />
            <Route
              path="inventory"
              lazy={lazyRoute(() => import('@app/routes/game/inventory/route'))}
              handle={scene(
                {
                  id: 'inventory',
                  presentation: 'service',
                  summary: '点清身边诸物，再决定去留流转。',
                },
                '储物袋',
              )}
            />
            <Route
              path="craft/alchemy"
              lazy={lazyRoute(
                () => import('@app/routes/game/craft/alchemy/route'),
              )}
              handle={scene(
                {
                  id: 'alchemy',
                  summary: '看药材、控炉候、炼丹息身。',
                },
                '【炼丹房】',
              )}
            />
            <Route
              path="market"
              lazy={lazyRoute(() => import('@app/routes/game/market/route'))}
              handle={scene(
                {
                  id: 'market',
                  presentation: 'hub',
                  summary: '买卖流转与鉴宝收材皆由此起。',
                },
                '修仙坊市',
              )}
            />
            <Route
              path="black-market"
              lazy={lazyRoute(
                () => import('@app/routes/game/black-market/route'),
              )}
              handle={scene(
                {
                  id: 'black-market',
                  presentation: 'workflow',
                  summary: '辨货、问价，在有限线索里决定是否落子。',
                },
                '暗巷黑市',
              )}
            />
            <Route
              path="mail"
              lazy={lazyRoute(() => import('@app/routes/game/mail/route'))}
              handle={scene(
                {
                  id: 'mail',
                  presentation: 'service',
                  summary: '往来玉简与好友名录皆归于此。',
                },
                '道友传音',
              )}
            />
            <Route
              path="activities"
              lazy={lazyRoute(
                () => import('@app/routes/game/activities/route'),
              )}
              handle={scene(
                {
                  id: 'activities',
                  presentation: 'service',
                  summary: '仙盟告示、限时活动与登录赠礼汇于此处。',
                },
                '仙盟活动',
              )}
            />
            <Route
              path="tower"
              lazy={lazyRoute(() => import('@app/routes/game/tower/route'))}
              handle={scene(
                {
                  id: 'tower',
                  summary:
                    '蜃气每周聚作一境。先应眼前幻影，再看名号能留到第几重。',
                },
                '蜃楼幻境',
              )}
            />
            <Route
              path="retreat"
              lazy={lazyRoute(() => import('@app/routes/game/retreat/route'))}
              handle={scene(
                {
                  id: 'retreat',
                  summary: '闭关、冲关与寿元筹算都在静室。',
                },
                '静室修行',
              )}
            />
            <Route
              path="inn"
              lazy={lazyRoute(() => import('@app/routes/game/inn/route'))}
              handle={scene(
                {
                  id: 'inn',
                  presentation: 'service',
                  summary: '借灵眼之泉温养伤势，稳住道体再续行。',
                },
                '灵眼之泉',
              )}
            />
            <Route
              path="spirit-field"
              lazy={lazyRoute(
                () => import('@app/routes/game/spirit-field/route'),
              )}
              handle={scene(
                {
                  id: 'spirit-field',
                  presentation: 'workflow',
                  summary: '播种、观察、养护与采收都在这片个人药圃中完成。',
                },
                '灵田',
              )}
            />
            <Route
              path="tasks"
              lazy={lazyRoute(() => import('@app/routes/game/tasks/route'))}
              handle={scene(
                {
                  id: 'tasks',
                  presentation: 'archive',
                  summary: '当前破境前置、试炼进度与已完成任务都在此归卷。',
                },
                '任务中心',
              )}
            />
            <Route
              path="skills"
              lazy={lazyRoute(() => import('@app/routes/game/skills/route'))}
              handle={scene(
                {
                  id: 'skills',
                  presentation: 'archive',
                  summary: '已成诸术归卷，便于查阅与取舍。',
                },
                '【所修神通】',
              )}
            />
            <Route
              path="sect"
              lazy={lazyRoute(() => import('@app/routes/game/sect/route'))}
              handle={scene(
                {
                  id: 'sect',
                  summary: '拜访诸宗、研习心法、选择流派并承接宗门委托。',
                },
                '宗门',
              )}
            />
            <Route
              path="sect/abilities"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/abilities/redirect'),
              )}
              handle={scene(
                {
                  id: 'sect-abilities',
                  presentation: 'workflow',
                  summary: '旧宗门神通入口将迁往宗门演武场。',
                },
                '宗门演武',
              )}
            />
            <Route
              path="sect/hall"
              lazy={lazyRoute(() => import('@app/routes/game/sect/hall/route'))}
              handle={scene(
                {
                  id: 'sect-hall',
                  presentation: 'archive',
                  summary: '身份、晋升、周俸与同门名录归于宗门大殿。',
                },
                '宗门大殿',
              )}
            />
            <Route
              path="sect/affairs"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/affairs/route'),
              )}
              handle={scene(
                {
                  id: 'sect-affairs',
                  summary: '宗门日常、周常、悬赏和晋升试炼由事务场所统一发放。',
                },
                '宗门事务',
              )}
            />
            <Route
              path="sect/archive"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/archive/route'),
              )}
              handle={scene(
                {
                  id: 'sect-archive',
                  presentation: 'workflow',
                  summary:
                    '宗门心法依次归档，研习受境界、职阶与设施等级共同约束。',
                },
                '宗门传承',
              )}
            />
            <Route
              path="sect/archive/methods"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/archive/methods/route'),
              )}
              handle={scene(
                {
                  id: 'sect-archive',
                  presentation: 'workflow',
                  summary: '旧心法入口将归入宗门传承场所。',
                },
                '宗门传承',
              )}
            />
            <Route
              path="sect/archive/paths"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/archive/paths/route'),
              )}
              handle={scene(
                {
                  id: 'sect-enlightenment-cliff',
                  presentation: 'workflow',
                  summary: '旧流派入口将迁往宗门悟道场所。',
                },
                '宗门悟道',
              )}
            />
            <Route
              path="sect/archive/abilities"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/archive/abilities/route'),
              )}
              handle={scene(
                {
                  id: 'sect-abilities',
                  presentation: 'workflow',
                  summary: '旧神通入口将迁往宗门演武场。',
                },
                '宗门演武',
              )}
            />
            <Route
              path="sect/enlightenment-cliff"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/enlightenment-cliff/route'),
              )}
              handle={scene(
                {
                  id: 'sect-enlightenment-cliff',
                  presentation: 'workflow',
                  summary: '选择流派、配置参悟节点并检视构筑变化。',
                },
                '宗门悟道',
              )}
            />
            <Route
              path="sect/arena"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/arena/route'),
              )}
              handle={scene(
                {
                  id: 'sect-abilities',
                  presentation: 'workflow',
                  summary: '配置宗门神通与自动战术。',
                },
                '宗门演武',
              )}
            />
            <Route
              path="sect/treasury"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/treasury/route'),
              )}
              handle={scene(
                {
                  id: 'sect-treasury',
                  presentation: 'service',
                  summary: '按弟子职阶使用贡献兑换常驻与每周轮换物资。',
                },
                '宗门宝库',
              )}
            />
            <Route
              path="sect/industries"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/industries/route'),
              )}
              handle={scene(
                {
                  id: 'sect-industries',
                  presentation: 'archive',
                  summary: '全宗设施、公共工程与建设捐献记录在此归档。',
                },
                '宗门建设',
              )}
            />
            <Route
              path="sect/cultivation-room"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/cultivation-room/route'),
              )}
              handle={scene(
                {
                  id: 'sect-cultivation-room',
                  summary: '宗门聚灵阵为现有闭关结算提供修为加成。',
                },
                '宗门修炼室',
              )}
            />
            <Route
              path="sect/workshop"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/workshop/route'),
              )}
              handle={scene(
                {
                  id: 'sect',
                  presentation: 'hub',
                  summary: '旧丹器坊入口将返回宗门总视图。',
                },
                '宗门',
              )}
            />
            <Route
              path="sect/alchemy"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/alchemy/route'),
              )}
              handle={scene(
                {
                  id: 'sect-alchemy',
                  presentation: 'workflow',
                  summary: '借宗门丹火完成即兴炼丹与丹方炼制。',
                },
                '宗门丹房',
              )}
            />
            <Route
              path="sect/refinery"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/refinery/route'),
              )}
              handle={scene(
                {
                  id: 'sect-refinery',
                  presentation: 'workflow',
                  summary: '借宗门地火锻造法宝。',
                },
                '宗门器坊',
              )}
            />
            <Route
              path="sect/spirit-vein"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/spirit-vein/route'),
              )}
              handle={scene(
                {
                  id: 'sect-spirit-vein',
                  presentation: 'service',
                  summary: '查看灵脉设施等级与灵石俸禄加成。',
                },
                '宗门灵脉',
              )}
            />

          <Route element={<GameActivityLayout />}>
            <Route
              path="sect/gate/sweep"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/gate/sweep/route'),
              )}
              handle={scene(
                {
                  id: 'sect-gate-sweep',
                  chrome: 'immersive',
                  dock: 'hidden',
                },
                '清扫山门',
              )}
            />
            <Route
              path="sect/spirit-vein/mining"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/spirit-vein/mining/route'),
              )}
              handle={scene(
                {
                  id: 'sect-spirit-vein-mining',
                  chrome: 'immersive',
                  dock: 'hidden',
                },
                '灵矿采掘',
              )}
            />
          </Route>

          <Route element={<GameCombatLayout />}>
            <Route
              path="battle/challenge"
              lazy={lazyRoute(
                () => import('@app/routes/game/battle/challenge/route'),
              )}
              handle={scene(
                {
                  id: 'battle-challenge',
                  chrome: 'immersive',
                  dock: 'hidden',
                },
                '挑战天骄',
              )}
            />
            <Route
              path="battle/live"
              lazy={lazyRoute(
                () => import('@app/routes/game/battle/live/lobby'),
              )}
              handle={scene(
                {
                  id: 'battle-live-lobby',
                  chrome: 'immersive',
                  dock: 'hidden',
                },
                '多人战斗邀请',
              )}
            />
            <Route
              path="battle/live/:matchId"
              lazy={lazyRoute(
                () => import('@app/routes/game/battle/live/route'),
              )}
              handle={scene(
                {
                  id: 'battle-live-match',
                  chrome: 'immersive',
                  dock: 'hidden',
                },
                '实时多人战局',
              )}
            />
            <Route
              path="battle/:id"
              lazy={lazyRoute(
                () => import('@app/routes/game/battle/detail/route'),
              )}
              handle={scene(
                {
                  id: 'battle-replay',
                  chrome: 'immersive',
                  dock: 'hidden',
                },
                '战斗回放',
              )}
            />
            <Route
              path="tower/battle"
              lazy={lazyRoute(
                () => import('@app/routes/game/tower/battle/route'),
              )}
              handle={scene(
                {
                  id: 'tower-battle',
                  chrome: 'immersive',
                  dock: 'hidden',
                },
                '蜃楼战局',
              )}
            />
            <Route
              path="bet-battle/challenge"
              lazy={lazyRoute(
                () => import('@app/routes/game/bet-battle/challenge/route'),
              )}
              handle={scene(
                {
                  id: 'bet-battle-challenge',
                  chrome: 'immersive',
                  dock: 'hidden',
                },
                '赌战挑战',
              )}
            />
            <Route
              path="training-room"
              lazy={lazyRoute(
                () => import('@app/routes/game/training-room/route'),
              )}
              handle={scene(
                {
                  id: 'training-room',
                  chrome: 'immersive',
                  dock: 'hidden',
                },
                '练功房',
              )}
            />
            <Route
              path="tasks/:taskId/challenge"
              lazy={lazyRoute(
                () => import('@app/routes/game/tasks/challenge/route'),
              )}
              handle={scene(
                {
                  id: 'task-challenge',
                  chrome: 'immersive',
                  dock: 'hidden',
                },
                '破境试炼',
              )}
            />
            <Route
              path="sect/tasks/:taskId/battle"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/task-battle/route'),
              )}
              handle={scene(
                {
                  id: 'sect-task-battle',
                  chrome: 'immersive',
                  dock: 'hidden',
                },
                '宗门战局',
              )}
            />
          </Route>

          <Route element={<GameMapLayout />}>
            <Route
              path="map"
              lazy={lazyRoute(() => import('@app/routes/game/map/route'))}
              handle={scene(
                {
                  id: 'map',
                  chrome: 'immersive',
                  dock: 'hidden',
                },
                mapTitle,
              )}
            />
            <Route
              path="sect/:sectId/visit"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/visit/route'),
              )}
              handle={scene(
                {
                  id: 'sect-visit',
                  chrome: 'immersive',
                  dock: 'hidden',
                },
                sectVisitTitle,
              )}
            />
            <Route
              path="sect/:sectId/gate"
              lazy={lazyRoute(
                () => import('@app/routes/game/sect/foreign-gate/route'),
              )}
              handle={scene(
                {
                  id: 'sect-foreign-gate',
                  chrome: 'immersive',
                  dock: 'hidden',
                },
                '外宗山门',
              )}
            />
          </Route>

          <Route element={<GameDungeonLayout />}>
            <Route
              path="dungeon"
              lazy={lazyRoute(() => import('@app/routes/game/dungeon/route'))}
              handle={scene(
                {
                  id: 'dungeon',
                  chrome: 'immersive',
                  dock: 'hidden',
                },
                '云游探秘',
              )}
            />
          </Route>
        </Route>
      </Route>

      <Route
        path="/admin"
        lazy={lazyRoute(() => import('@app/routes/admin/layout'))}
        handle={title('万界司天台')}
      >
        <Route
          index
          lazy={lazyRoute(() => import('@app/routes/admin/route'))}
          handle={title('总览')}
        />
        <Route
          path="feedback"
          lazy={lazyRoute(() => import('@app/routes/admin/feedback/route'))}
          handle={title('用户反馈')}
        />
        <Route
          path="accounts"
          lazy={lazyRoute(() => import('@app/routes/admin/accounts/route'))}
          handle={title('账号管理')}
        />
        <Route
          path="broadcast/email"
          lazy={lazyRoute(
            () => import('@app/routes/admin/broadcast/email/route'),
          )}
          handle={title('邮箱群发')}
        />
        <Route
          path="broadcast/game-mail"
          lazy={lazyRoute(
            () => import('@app/routes/admin/broadcast/game-mail/route'),
          )}
          handle={title('游戏邮件')}
        />
        <Route
          path="announcement"
          lazy={lazyRoute(() => import('@app/routes/admin/announcement/route'))}
          handle={title('游戏公告')}
        />
        <Route
          path="item-library"
          lazy={lazyRoute(() => import('@app/routes/admin/item-library/route'))}
          handle={title('道具库')}
        />
        <Route
          path="reputation-shop"
          lazy={lazyRoute(
            () => import('@app/routes/admin/reputation-shop/route'),
          )}
          handle={title('声望商店管理')}
        />
        <Route
          path="sect-shop"
          lazy={lazyRoute(() => import('@app/routes/admin/sect-shop/route'))}
          handle={title('宗门宝库管理')}
        />
        <Route
          path="templates"
          lazy={lazyRoute(() => import('@app/routes/admin/templates/route'))}
          handle={title('模板中心')}
        />
        <Route
          path="templates/new"
          lazy={lazyRoute(
            () => import('@app/routes/admin/templates/new/route'),
          )}
          handle={title('新建模板')}
        />
        <Route
          path="templates/:id"
          lazy={lazyRoute(
            () => import('@app/routes/admin/templates/detail/route'),
          )}
          handle={title('模板详情')}
        />
        <Route
          path="redeem-codes"
          lazy={lazyRoute(() => import('@app/routes/admin/redeem-codes/route'))}
          handle={title('兑换码管理')}
        />
        <Route
          path="redeem-codes/new"
          lazy={lazyRoute(
            () => import('@app/routes/admin/redeem-codes/new/route'),
          )}
          handle={title('新建兑换码')}
        />
        <Route
          path="llm-metrics"
          lazy={lazyRoute(() => import('@app/routes/admin/llm-metrics/route'))}
          handle={title('LLM 观测')}
        />
        <Route
          path="online-users"
          lazy={lazyRoute(() => import('@app/routes/admin/online-users/route'))}
          handle={title('在线人数')}
        />
        <Route
          path="operations"
          lazy={lazyRoute(() => import('@app/routes/admin/operations/route'))}
          handle={title('运营数据')}
        />
        <Route
          path="activities"
          lazy={lazyRoute(() => import('@app/routes/admin/activities/route'))}
          handle={title('活动配置中心')}
        />
        <Route
          path="players"
          lazy={lazyRoute(() => import('@app/routes/admin/players/route'))}
          handle={title('玩家检索与补发')}
        />
        <Route
          path="jobs"
          lazy={lazyRoute(() => import('@app/routes/admin/jobs/route'))}
          handle={title('批处理任务')}
        />
        <Route
          path="audit"
          lazy={lazyRoute(() => import('@app/routes/admin/audit/route'))}
          handle={title('操作审计')}
        />
        <Route
          path="battle-simulator"
          lazy={lazyRoute(
            () => import('@app/routes/admin/battle-simulator/route'),
          )}
          handle={title('对战模拟器')}
        />
        <Route
          path="tower-enemy-sets"
          lazy={lazyRoute(
            () => import('@app/routes/admin/tower-enemy-sets/route'),
          )}
          handle={title('蜃楼敌人')}
        />
        <Route
          path="community-group"
          lazy={lazyRoute(
            () => import('@app/routes/admin/community-qrcode/route'),
          )}
          handle={title('QQ交流群')}
        />
      </Route>

      <Route
        path="*"
        lazy={lazyRoute(() => import('@app/routes/not-found'))}
        handle={title('缘分未至')}
      />
    </Route>,
  ),
);
