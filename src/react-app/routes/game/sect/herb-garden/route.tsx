import { useHerbGarden } from '@app/components/feature/sect/herbGardenResources';
import { GameSceneLoading, GameSceneNote } from '@app/components/game-shell';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton } from '@app/components/ui/InkButton';
import { InkCard } from '@app/components/ui/InkCard';
import type {
  CultivationMethodDefinition,
  CultivationMethodId,
  HerbGardenPlotView,
  HerbGardenState,
} from '@shared/contracts/herbGarden';
import { useEffect, useMemo, useState } from 'react';
import { SectPermissionBoundary, SectScene } from '../components/SectScene';

const SLOT_NAMES = ['壹号畦', '贰号畦', '叁号畦', '肆号畦', '伍号畦', '陆号畦'];
const STAGE_NAMES = {
  germination: '启灵',
  growth: '生长',
  formation: '凝华',
  ready: '成熟',
} as const;

export default function SectHerbGardenPage() {
  return (
    <SectPermissionBoundary
      permission="sect.herb_garden.view"
      sceneKey="herbGarden"
    >
      <HerbGardenScene />
    </SectPermissionBoundary>
  );
}

function HerbGardenScene() {
  const { pushToast } = useInkUI();
  const [visitOwnerId, setVisitOwnerId] = useState<string>();
  const garden = useHerbGarden(visitOwnerId);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (garden.loading && !garden.data) {
    return (
      <SectScene sceneKey="herbGarden" mood="garden">
        <GameSceneLoading message="司农执事正在翻开今日草木值录……" />
      </SectScene>
    );
  }
  if (!garden.data) {
    return (
      <SectScene sceneKey="herbGarden" mood="garden">
        <GameSceneNote tone="danger">
          {garden.error ?? '灵田暂时无法读取。'}
        </GameSceneNote>
        <InkButton onClick={() => void garden.retry()}>重新读取</InkButton>
      </SectScene>
    );
  }

  const state = garden.data;
  const notify = (message: string) => pushToast({ message, tone: 'success' });
  return (
    <SectScene sceneKey="herbGarden" mood="garden">
      <div className="space-y-4">
        <header className="border-b border-current/10 pb-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-ink-secondary text-xs tracking-[0.24em]">
                六畦并作 · 三候养成
              </p>
              <h1 className="mt-1 text-xl font-semibold">
                {state.owner.name}的灵田
              </h1>
              <p className="text-ink-secondary mt-1 text-xs">
                药圃 Lv.{state.gardenLevel} ·
                种性只显征兆，培育结果由三阶段共同决定
              </p>
            </div>
            {!state.owner.isSelf ? (
              <InkButton onClick={() => setVisitOwnerId(undefined)}>
                返回我的灵田
              </InkButton>
            ) : null}
          </div>
        </header>

        {garden.error ? (
          <GameSceneNote tone="danger">{garden.error}</GameSceneNote>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <section>
            <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
              <Metric label="在田" value={`${state.summary.planted}/6`} />
              <Metric
                label="待决策"
                value={String(state.summary.awaitingAction)}
              />
              <Metric label="可收获" value={String(state.summary.ready)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {state.plots.map((plot) => (
                <PlotCard
                  key={plot.slot}
                  plot={plot}
                  state={state}
                  now={now}
                  busy={garden.busy}
                  onPlant={async (seedId, methodId, materialId) => {
                    await garden.plant(plot.slot, seedId, methodId, materialId);
                    notify('灵种已入土，启灵阶段开始。');
                  }}
                  onCultivate={async (methodId, materialId) => {
                    await garden.cultivate(plot.plotId!, methodId, materialId);
                    notify('培育法已施展，草木灵机开始沉淀。');
                  }}
                  onHarvest={async () => {
                    const result = await garden.harvest(plot.plotId!);
                    notify(
                      `收获「${result.result.name}」×${result.result.quantity}`,
                    );
                  }}
                  onHelp={async () => {
                    await garden.help(state.owner.cultivatorId, plot.plotId!);
                    notify('你为道友引来一缕灵气。');
                  }}
                  onSteal={async () => {
                    const result = await garden.steal(
                      state.owner.cultivatorId,
                      plot.plotId!,
                    );
                    notify(`顺手采得「${result.result.name}」×1`);
                  }}
                />
              ))}
            </div>
          </section>

          <aside className="space-y-3">
            {state.owner.isSelf ? (
              <InkCard className="mb-0" padding="md">
                <PanelTitle title="灵种匣" meta={`${state.seeds.length} 类`} />
                <div className="space-y-2 text-xs">
                  {state.seeds.length ? (
                    state.seeds.map((seed) => (
                      <div
                        key={seed.materialId}
                        className="flex justify-between border-b border-dashed border-current/10 pb-2 last:border-0"
                      >
                        <span>
                          {seed.name}
                          <span className="text-ink-secondary ml-1">
                            · {seed.hint}
                          </span>
                        </span>
                        <span>×{seed.quantity}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-ink-secondary">
                      暂无灵种，可从副本、历练、坊市或宗门宝库取得。
                    </p>
                  )}
                </div>
              </InkCard>
            ) : null}

            <InkCard className="mb-0" padding="md">
              <PanelTitle title="田间记录" meta={`${state.logs.length} 条`} />
              <div className="space-y-2 text-xs leading-5">
                {state.logs.slice(0, 6).map((log) => (
                  <p
                    key={log.id}
                    className="border-b border-dashed border-current/10 pb-2 last:border-0"
                  >
                    {log.message}
                  </p>
                ))}
                {!state.logs.length ? (
                  <p className="text-ink-secondary">今日田间清静。</p>
                ) : null}
              </div>
            </InkCard>

            {state.owner.isSelf ? (
              <InkCard className="mb-0" padding="md">
                <PanelTitle title="好友灵田" meta="互助 · 访采" />
                <div className="space-y-1">
                  {state.friends.map((friend) => (
                    <button
                      key={friend.cultivatorId}
                      type="button"
                      className="hover:bg-ink/5 flex w-full justify-between border-b border-dashed border-current/10 py-2 text-left text-xs last:border-0"
                      onClick={() => setVisitOwnerId(friend.cultivatorId)}
                    >
                      <span>
                        {friend.name} · {friend.realm}
                      </span>
                      <span
                        className={
                          friend.readyPlots
                            ? 'text-crimson'
                            : 'text-ink-secondary'
                        }
                      >
                        {friend.readyPlots
                          ? `${friend.readyPlots} 畦成熟`
                          : friend.growingPlots
                            ? '生长中'
                            : '空田'}
                      </span>
                    </button>
                  ))}
                  {!state.friends.length ? (
                    <p className="text-ink-secondary text-xs">
                      结识道友后可互访灵田。
                    </p>
                  ) : null}
                </div>
              </InkCard>
            ) : null}
          </aside>
        </div>
      </div>
    </SectScene>
  );
}

function PlotCard(props: {
  plot: HerbGardenPlotView;
  state: HerbGardenState;
  now: number;
  busy: boolean;
  onPlant: (
    seedId: string,
    methodId: CultivationMethodId,
    materialId?: string,
  ) => Promise<void>;
  onCultivate: (
    methodId: CultivationMethodId,
    materialId?: string,
  ) => Promise<void>;
  onHarvest: () => Promise<void>;
  onHelp: () => Promise<void>;
  onSteal: () => Promise<void>;
}) {
  const { plot, state } = props;
  const [seedId, setSeedId] = useState(state.seeds[0]?.materialId ?? '');
  const [methodId, setMethodId] = useState<CultivationMethodId>(
    state.methods[0]?.id ?? 'slow_nurture',
  );
  const method =
    state.methods.find((item) => item.id === methodId) ?? state.methods[0];
  const eligibleMaterials = useMemo(
    () =>
      method?.materialType
        ? state.methodMaterials.filter(
            (item) => item.type === method.materialType,
          )
        : [],
    [method, state.methodMaterials],
  );
  const [materialId, setMaterialId] = useState('');
  const actionDisabled =
    props.busy ||
    !method ||
    Boolean(
      method.materialType && !(materialId || eligibleMaterials[0]?.materialId),
    );
  const selectedMaterial = materialId || eligibleMaterials[0]?.materialId;
  const run = (operation: () => Promise<void>) =>
    void operation().catch(() => undefined);

  if (plot.status === 'empty') {
    return (
      <InkCard className="mb-0 min-h-64" padding="md">
        <PlotHeading slot={plot.slot} status="空畦" />
        {state.owner.isSelf ? (
          <div className="mt-5 space-y-3">
            <Select
              value={seedId}
              onChange={setSeedId}
              options={state.seeds.map((seed) => ({
                value: seed.materialId,
                label: `${seed.name} · ${seed.rank} · ×${seed.quantity}`,
              }))}
              placeholder="选择灵种"
            />
            <MethodPicker
              methods={state.methods}
              methodId={methodId}
              setMethodId={setMethodId}
            />
            {method?.materialType ? (
              <Select
                value={materialId}
                onChange={setMaterialId}
                options={eligibleMaterials.map((item) => ({
                  value: item.materialId,
                  label: `${item.name} · ×${item.quantity}`,
                }))}
                placeholder={`选择 ${method.materialType} 材料`}
              />
            ) : null}
            <InkButton
              variant="primary"
              disabled={actionDisabled || !seedId}
              onClick={() =>
                run(() => props.onPlant(seedId, methodId, selectedMaterial))
              }
            >
              播种并启灵
            </InkButton>
          </div>
        ) : (
          <p className="text-ink-secondary mt-8 text-center text-xs">
            此畦尚未播种
          </p>
        )}
      </InkCard>
    );
  }

  const remaining = plot.readyAt
    ? Math.max(0, new Date(plot.readyAt).getTime() - props.now)
    : 0;
  return (
    <InkCard className="mb-0 min-h-64" padding="md">
      <PlotHeading
        slot={plot.slot}
        status={
          plot.status === 'ready'
            ? '成熟'
            : plot.status === 'awaiting_action'
              ? '待择法'
              : STAGE_NAMES[plot.stage ?? 'germination']
        }
      />
      <div className="mt-3">
        <p className="font-medium">{plot.seedName}</p>
        <p className="text-ink-secondary mt-1 text-xs">
          {plot.seedRank} · {plot.element ?? '无属'} · {plot.hint}
        </p>
        {plot.status === 'cultivating' ? (
          <p className="mt-4 text-sm">尚需约 {formatRemaining(remaining)}</p>
        ) : null}
        {state.owner.isSelf && plot.history?.length ? (
          <p className="text-ink-secondary mt-3 border-l-2 border-emerald-900/20 pl-2 text-xs leading-5">
            {plot.history[plot.history.length - 1]?.feedback}
          </p>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {state.owner.isSelf && plot.status === 'awaiting_action' ? (
          <>
            <MethodPicker
              methods={state.methods}
              methodId={methodId}
              setMethodId={setMethodId}
            />
            {method?.materialType ? (
              <Select
                value={materialId}
                onChange={setMaterialId}
                options={eligibleMaterials.map((item) => ({
                  value: item.materialId,
                  label: `${item.name} · ×${item.quantity}`,
                }))}
                placeholder={`选择 ${method.materialType} 材料`}
              />
            ) : null}
            <InkButton
              variant="primary"
              disabled={actionDisabled}
              onClick={() =>
                run(() => props.onCultivate(methodId, selectedMaterial))
              }
            >
              进入下一阶段
            </InkButton>
          </>
        ) : null}
        {state.owner.isSelf && plot.status === 'ready' ? (
          <InkButton
            variant="primary"
            disabled={props.busy}
            onClick={() => run(props.onHarvest)}
          >
            收获此畦
          </InkButton>
        ) : null}
        {!state.owner.isSelf && plot.canHelp ? (
          <InkButton disabled={props.busy} onClick={() => run(props.onHelp)}>
            引气相助
          </InkButton>
        ) : null}
        {!state.owner.isSelf && plot.canSteal ? (
          <InkButton
            variant="primary"
            disabled={props.busy}
            onClick={() => run(props.onSteal)}
          >
            顺手采一份
          </InkButton>
        ) : null}
      </div>
    </InkCard>
  );
}

function MethodPicker({
  methods,
  methodId,
  setMethodId,
}: {
  methods: CultivationMethodDefinition[];
  methodId: CultivationMethodId;
  setMethodId: (id: CultivationMethodId) => void;
}) {
  return (
    <Select
      value={methodId}
      onChange={(value) => setMethodId(value as CultivationMethodId)}
      options={methods.map((method) => ({
        value: method.id,
        label: `${method.name}${method.materialType ? ' · 耗材' : ''}`,
      }))}
      placeholder="选择培育法"
    />
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
}) {
  return (
    <select
      className="border-ink/15 bg-bgpaper/70 w-full border px-2 py-2 text-xs"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function PlotHeading({ slot, status }: { slot: number; status: string }) {
  return (
    <div className="flex items-center justify-between border-b border-current/10 pb-2 text-xs">
      <span className="tracking-[0.16em]">{SLOT_NAMES[slot - 1]}</span>
      <span className="text-emerald-900/70">{status}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bgpaper/35 border border-current/10 px-2 py-2">
      <strong className="block text-base">{value}</strong>
      <span className="text-ink-secondary">{label}</span>
    </div>
  );
}

function PanelTitle({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="mb-3 flex items-center justify-between border-b border-current/10 pb-2">
      <h2 className="text-sm font-medium tracking-[0.12em]">{title}</h2>
      <span className="text-ink-secondary text-[11px]">{meta}</span>
    </div>
  );
}

function formatRemaining(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} 分钟`;
  return `${Math.floor(minutes / 60)} 时 ${minutes % 60} 分`;
}
