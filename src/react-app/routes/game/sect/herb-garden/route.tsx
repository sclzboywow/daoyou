import { describePillOperation } from '@app/components/feature/consumables';
import {
  NpcConversation,
  type NpcConversationMessage,
  type NpcConversationOption,
} from '@app/components/feature/room';
import { useHerbGarden } from '@app/components/feature/sect/herbGardenResources';
import {
  SectFacilityStatusConversation,
  SectNpcConversationRegistry,
  SectRoutedRoom,
  type SectNpcConversationRendererProps,
} from '@app/components/feature/sect/room';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton } from '@app/components/ui/InkButton';
import type {
  CultivationMethodDefinition,
  FormationMethodDefinition,
  HerbGardenActionId,
  HerbGardenJournalEntry,
  HerbGardenObservationKind,
  HerbGardenPlotView,
  HerbGardenState,
  StageAssessment,
} from '@shared/contracts/herbGarden';
import { STANDARD_SECT_PRESENTATION } from '@shared/engine/sect';
import { cn } from '@shared/lib/cn';
import {
  QUALITY_ORDER,
  type ElementType,
  type MaterialType,
} from '@shared/types/constants';
import { useEffect, useMemo, useState } from 'react';
import { SectPermissionBoundary, SectScene } from '../components/SectScene';

const registry = new SectNpcConversationRegistry([
  {
    key: 'sect.herb-garden.status',
    renderer: SectFacilityStatusConversation,
  },
  {
    key: 'sect.herb-garden.caretaker',
    renderer: HerbGardenCaretakerConversation,
  },
]).assertRoom(STANDARD_SECT_PRESENTATION.rooms.herbGarden);

const SLOT_NAMES = ['壹号畦', '贰号畦', '叁号畦', '肆号畦', '伍号畦', '陆号畦'];
const STAGE_NAMES = {
  germination: '启灵',
  growth: '蕴养',
  formation: '凝华',
  ready: '成熟',
} as const;

const ASSESSMENT_COPY: Record<
  StageAssessment,
  { label: string; detail: string }
> = {
  resonant: {
    label: '◎ 极为契合',
    detail: '这一步明显顺应了灵植种性。',
  },
  aligned: {
    label: '○ 契合',
    detail: '这一步与当前长势相合。',
  },
  neutral: {
    label: '· 平稳',
    detail: '灵植能够承受，但未显出明显喜恶。',
  },
  conflict: {
    label: '× 相冲',
    detail: '这一步与种性存在冲突，长势受到影响。',
  },
};

const METHOD_TAG_LABELS: Partial<
  Record<CultivationMethodDefinition['methodTags'][number], string>
> = {
  slow_nurture: '温和培育',
  qi_acceleration: '快速催生',
  spirit_stone_stabilization: '稳固根土',
  root_resonance: '灵根共鸣',
  herb_companion: '药性伴养',
  ore_soil: '矿性改土',
  monster_blood: '强刺激生机',
  aux_formation: '聚灵阵养',
  pill_nourishment: '丹力滋养',
  tcdb_catalysis: '灵珍催化',
};

const ENVIRONMENT_TAG_LABELS: Partial<
  Record<CultivationMethodDefinition['environmentTags'][number], string>
> = {
  balanced_soil: '平和土性',
  sunlit_dry: '干暖',
  shaded_cool: '阴凉',
  moist_watered: '湿润',
  qi_dense: '灵气浓郁',
  mineral_rich: '矿性充足',
  wind_exposed: '风性环境',
  thunder_charged: '雷性环境',
};

type GardenMethodOption =
  | CultivationMethodDefinition
  | FormationMethodDefinition;
type GardenMode = 'overview' | 'plot' | 'seeds' | 'logs' | 'friends';

export default function SectHerbGardenPage() {
  return (
    <SectPermissionBoundary
      permission="sect.herb_garden.view"
      sceneKey="herbGarden"
    >
      <SectScene sceneKey="herbGarden" mood="garden">
        <SectRoutedRoom
          roomKey="herbGarden"
          registry={registry}
          eyebrow="药畦晨露 · 草木值录"
        />
      </SectScene>
    </SectPermissionBoundary>
  );
}

function HerbGardenCaretakerConversation({
  actor,
  onExit,
}: SectNpcConversationRendererProps) {
  const { pushToast } = useInkUI();
  const [mode, setMode] = useState<GardenMode>('overview');
  const [selectedSlot, setSelectedSlot] = useState<number>();
  const [visitOwnerId, setVisitOwnerId] = useState<string>();
  const garden = useHerbGarden(visitOwnerId);

  const notify = (message: string) => pushToast({ message, tone: 'success' });
  const returnToOverview = () => {
    setSelectedSlot(undefined);
    setMode('overview');
  };

  if (!garden.data) {
    return (
      <NpcConversation
        actor={actor}
        messages={[
          {
            id: 'loading',
            speaker: actor.name,
            body: garden.loading
              ? '且稍候，我正在翻看今日草木值录。'
              : '田间值录一时未能取来，请稍后重试。',
            tone: garden.error ? 'attention' : 'normal',
          },
        ]}
        busy={garden.loading}
        error={garden.error}
        options={[
          { id: 'retry', label: '重新翻看值录', disabled: garden.loading },
          { id: 'leave', label: '弟子告退', tone: 'muted' },
        ]}
        onSelectOption={(optionId) => {
          if (optionId === 'retry') void garden.retry();
          else onExit();
        }}
      />
    );
  }

  const state = garden.data;
  const selectedPlot = state.plots.find((plot) => plot.slot === selectedSlot);
  if (mode === 'plot' && selectedPlot) {
    return (
      <PlotConversation
        actor={actor}
        state={state}
        plot={selectedPlot}
        busy={garden.busy}
        error={garden.error}
        onBack={returnToOverview}
        onPlant={async (seedId, actionId, materialId, rootElement) => {
          await garden.plant(
            selectedPlot.slot,
            seedId,
            actionId,
            materialId,
            rootElement,
          );
          notify('灵种已经入土，本轮培育结论已记入草木值录。');
        }}
        onCultivate={async (actionId, materialId, rootElement) => {
          await garden.cultivate(
            selectedPlot.plotId!,
            actionId,
            materialId,
            rootElement,
          );
          notify('本阶段培育完成，新的契合结论已写入值录。');
        }}
        onObserve={async (observation) => {
          await garden.observe(selectedPlot.plotId!, observation);
          notify('新的草木线索已记入当前认知。');
        }}
        onConsult={async (question) => {
          await garden.consult(selectedPlot.plotId!, question);
          notify('药园执事已依据现有线索作答。');
        }}
        onHarvest={async () => {
          const response = await garden.harvest(selectedPlot.plotId!);
          notify(
            `收获「${response.result.name}」共 ${response.result.quantity} 份。`,
          );
          returnToOverview();
        }}
        onHelp={async () => {
          await garden.help(state.owner.cultivatorId, selectedPlot.plotId!);
          notify('你为道友引来一缕灵气。');
        }}
        onSteal={async () => {
          const response = await garden.steal(
            state.owner.cultivatorId,
            selectedPlot.plotId!,
          );
          notify(`采得「${response.result.name}」一份。`);
        }}
      />
    );
  }

  if (mode === 'seeds') {
    return (
      <NpcConversation
        actor={actor}
        messages={[
          {
            id: 'seeds',
            speaker: actor.name,
            body: `种子的外相只是第一条线索。入土后要靠辨察与每轮培育反馈逐步认清种性。你当前为${state.progression.realm}，最高可培育${state.progression.maxSeedQuality}灵种。`,
          },
        ]}
        error={garden.error}
        options={[{ id: 'back', label: '返回巡视六畦', tone: 'muted' }]}
        onSelectOption={returnToOverview}
      >
        <SeedList state={state} />
      </NpcConversation>
    );
  }

  if (mode === 'logs') {
    return (
      <NpcConversation
        actor={actor}
        messages={[
          {
            id: 'logs',
            speaker: actor.name,
            body: '近来的播种、培育与访客动静，都按时序记在这里。',
          },
        ]}
        error={garden.error}
        options={[{ id: 'back', label: '返回巡视六畦', tone: 'muted' }]}
        onSelectOption={returnToOverview}
      >
        <GardenLogs state={state} />
      </NpcConversation>
    );
  }

  if (mode === 'friends') {
    return (
      <NpcConversation
        actor={actor}
        messages={[
          {
            id: 'friends',
            speaker: actor.name,
            body: '好友的药田可以互相照料；成熟灵植也会留出少量访采份额。',
          },
        ]}
        error={garden.error}
        options={[{ id: 'back', label: '返回巡视六畦', tone: 'muted' }]}
        onSelectOption={returnToOverview}
      >
        <FriendList
          state={state}
          onVisit={(cultivatorId) => {
            setVisitOwnerId(cultivatorId);
            setMode('overview');
          }}
        />
      </NpcConversation>
    );
  }

  const overviewMessages: NpcConversationMessage[] = [
    { id: 'greeting', speaker: actor.name, body: actor.greeting },
    {
      id: 'summary',
      speaker: actor.name,
      body: state.owner.isSelf
        ? `六畦之中，现有 ${state.summary.planted} 畦在田，${state.summary.awaitingAction} 畦待择法，${state.summary.ready} 畦已经成熟。`
        : `这里是${state.owner.name}的药田。可替道友照料未成熟灵植，也可访采成熟灵植留下的份额。`,
    },
  ];
  const overviewOptions: NpcConversationOption[] = state.owner.isSelf
    ? [
        ...(state.summary.ready
          ? [
              {
                id: 'harvest-all',
                label: '收取所有成熟灵植',
                tone: 'primary' as const,
              },
            ]
          : []),
        { id: 'seeds', label: '查看灵种匣' },
        { id: 'friends', label: '前往好友灵田' },
        { id: 'logs', label: '翻看田间记录' },
        { id: 'leave', label: '弟子告退', tone: 'muted' },
      ]
    : [
        { id: 'my-garden', label: '返回我的药田', tone: 'muted' },
        { id: 'leave', label: '弟子告退', tone: 'muted' },
      ];

  return (
    <NpcConversation
      actor={actor}
      messages={overviewMessages}
      options={overviewOptions}
      busy={garden.busy}
      error={garden.error}
      onSelectOption={(optionId) => {
        if (optionId === 'seeds') setMode('seeds');
        else if (optionId === 'friends') setMode('friends');
        else if (optionId === 'logs') setMode('logs');
        else if (optionId === 'my-garden') {
          setVisitOwnerId(undefined);
          setMode('overview');
        } else if (optionId === 'harvest-all') {
          void garden
            .harvestAll()
            .then((response) => {
              const total = response.results.reduce(
                (sum, result) => sum + result.quantity,
                0,
              );
              notify(
                `共收取 ${response.results.length} 畦，得到 ${total} 份产物。`,
              );
            })
            .catch(() => undefined);
        } else onExit();
      }}
    >
      <PlotGrid
        state={state}
        onSelect={(slot) => {
          setSelectedSlot(slot);
          setMode('plot');
        }}
      />
    </NpcConversation>
  );
}

function PlotGrid({
  state,
  onSelect,
}: {
  state: HerbGardenState;
  onSelect(slot: number): void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {state.plots.map((plot) => (
        <button
          key={plot.slot}
          type="button"
          onClick={() => onSelect(plot.slot)}
          className="border-ink/15 bg-ink/[0.02] hover:border-crimson/35 hover:bg-crimson/[0.035] focus-visible:outline-crimson min-h-28 border px-4 py-3 text-left transition-colors focus-visible:outline-2"
        >
          <span className="text-ink-secondary flex items-center justify-between text-xs">
            <span>{SLOT_NAMES[plot.slot - 1]}</span>
            <span>{plotStatusText(plot)}</span>
          </span>
          <strong className="mt-3 block text-sm font-normal">
            {plot.seedName ?? '畦土已整，尚未播种'}
          </strong>
          <span className="text-ink-secondary mt-2 block text-xs leading-5">
            {plot.status === 'cultivating' && plot.readyAt
              ? `尚需约 ${formatRemaining(new Date(plot.readyAt).getTime() - now)}`
              : plot.status === 'awaiting_action'
                ? '本阶段已成，可先辨察线索，再选择下一步培育法'
                : plot.status === 'ready'
                  ? `已成「${plot.outcomePreview?.name ?? '成熟灵植'}」`
                  : '点击此畦选择灵种'}
          </span>
        </button>
      ))}
    </div>
  );
}

function PlotConversation(props: {
  actor: SectNpcConversationRendererProps['actor'];
  state: HerbGardenState;
  plot: HerbGardenPlotView;
  busy: boolean;
  error?: string;
  onBack(): void;
  onPlant(
    seedId: string,
    actionId: HerbGardenActionId,
    materialId?: string,
    rootElement?: ElementType,
  ): Promise<void>;
  onCultivate(
    actionId: HerbGardenActionId,
    materialId?: string,
    rootElement?: ElementType,
  ): Promise<void>;
  onHarvest(): Promise<void>;
  onObserve(observation: HerbGardenObservationKind): Promise<void>;
  onConsult(question: string): Promise<void>;
  onHelp(): Promise<void>;
  onSteal(): Promise<void>;
}) {
  const { plot, state } = props;
  const actionStage =
    plot.status === 'empty'
      ? 'germination'
      : plot.stage === 'germination'
        ? 'growth'
        : plot.stage === 'growth'
          ? 'formation'
          : undefined;
  const methodOptions = useMemo<GardenMethodOption[]>(
    () =>
      actionStage === 'formation'
        ? state.formationMethods
        : state.methods.filter((method) =>
            actionStage ? method.stages.includes(actionStage) : false,
          ),
    [actionStage, state.formationMethods, state.methods],
  );
  const [seedId, setSeedId] = useState('');
  const [actionId, setActionId] = useState<HerbGardenActionId | ''>('');
  const [materialId, setMaterialId] = useState('');
  const [rootElement, setRootElement] = useState<ElementType | ''>('');
  const [question, setQuestion] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedSeedId = state.seeds.some(
    (seed) => seed.materialId === seedId && seed.plantable,
  )
    ? seedId
    : (state.seeds.find((seed) => seed.plantable)?.materialId ?? '');
  const selectedActionId = methodOptions.some(
    (methodOption) => methodOption.id === actionId,
  )
    ? actionId
    : (methodOptions[0]?.id ?? '');
  const method = state.methods.find((entry) => entry.id === selectedActionId);
  const materialType =
    method?.cost.kind === 'material' ? method.cost.materialType : undefined;
  const materials = useMemo(
    () =>
      materialType
        ? state.methodMaterials.filter((item) => item.type === materialType)
        : [],
    [materialType, state.methodMaterials],
  );
  const selectedMaterialId = materials.some(
    (material) => material.materialId === materialId,
  )
    ? materialId
    : (materials[0]?.materialId ?? '');
  const selectedRootElement = state.spiritualRoots.some(
    (root) => root.element === rootElement,
  )
    ? rootElement
    : (state.spiritualRoots[0]?.element ?? '');

  const messages: NpcConversationMessage[] = [
    {
      id: 'plot',
      speaker: props.actor.name,
      body:
        plot.status === 'empty'
          ? `${SLOT_NAMES[plot.slot - 1]}已经整好，可从灵种匣中选一枚入土。首次选择只是起点，之后可根据草木反馈逐步修正养法。`
          : `${SLOT_NAMES[plot.slot - 1]}种着「${plot.seedName}」，眼下正处于${STAGE_NAMES[plot.stage ?? 'germination']}。先看已知线索，再决定是否继续辨察或择法。`,
    },
  ];
  if (plot.description)
    messages.push({
      id: 'seed-description',
      body: plot.description,
      tone: 'muted',
    });
  if (plot.status === 'cultivating' && plot.readyAt)
    messages.push({
      id: 'waiting',
      speaker: props.actor.name,
      body: `草木灵机仍在沉淀，尚需约 ${formatRemaining(new Date(plot.readyAt).getTime() - now)}。这期间仍可辨察本阶段征兆。`,
    });
  if (plot.status === 'ready' && plot.outcomePreview)
    messages.push({
      id: 'ready',
      speaker: props.actor.name,
      body: `此株已凝成「${plot.outcomePreview.name}」，品阶为${plot.outcomePreview.rank}，当前可收获 ${plot.remainingYield ?? 0} 份。${
        plot.outcomePreview.operations?.length
          ? ` 灵果效用：${plot.outcomePreview.operations
              .map(describePillOperation)
              .join('；')}。`
          : ''
      }`,
    });

  const needsDecision =
    state.owner.isSelf &&
    (plot.status === 'empty' || plot.status === 'awaiting_action');
  const submitDisabled =
    props.busy ||
    !selectedActionId ||
    (plot.status === 'empty' && !selectedSeedId) ||
    Boolean(materialType && !selectedMaterialId) ||
    Boolean(method?.requiresRoot && !selectedRootElement);

  return (
    <NpcConversation
      actor={props.actor}
      messages={messages}
      busy={props.busy}
      error={props.error}
      options={[
        ...(state.owner.isSelf && plot.status === 'ready'
          ? [{ id: 'harvest', label: '确认收获此畦', tone: 'primary' as const }]
          : []),
        ...(!state.owner.isSelf && plot.canHelp
          ? [{ id: 'help', label: '引气相助' }]
          : []),
        ...(!state.owner.isSelf && plot.canSteal
          ? [{ id: 'steal', label: '访采一份', tone: 'primary' as const }]
          : []),
        { id: 'back', label: '返回巡视六畦', tone: 'muted' },
      ]}
      onSelectOption={(optionId) => {
        const run =
          optionId === 'harvest'
            ? props.onHarvest
            : optionId === 'help'
              ? props.onHelp
              : optionId === 'steal'
                ? props.onSteal
                : undefined;
        if (run) void run().catch(() => undefined);
        else props.onBack();
      }}
    >
      {state.owner.isSelf && plot.status !== 'empty' ? (
        <GardenKnowledge plot={plot} />
      ) : null}

      {state.owner.isSelf &&
      plot.status !== 'empty' &&
      plot.status !== 'ready' ? (
        <div className="border-ink/10 mt-5 space-y-4 border-t pt-4">
          <ObservationTools
            plot={plot}
            busy={props.busy}
            onObserve={props.onObserve}
          />
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              const value = question.trim();
              if (!value) return;
              void props
                .onConsult(value)
                .then(() => setQuestion(''))
                .catch(() => undefined);
            }}
          >
            <div className="flex items-center justify-between gap-3 text-xs">
              <label
                htmlFor={`garden-question-${plot.plotId}`}
                className="text-ink-secondary"
              >
                请教药园执事 · 只解释已经发现的线索
              </label>
              <span className="text-ink-secondary">
                {plot.questionAllowance?.used ?? 0}/
                {plot.questionAllowance?.limit ?? 2}
              </span>
            </div>
            <textarea
              id={`garden-question-${plot.plotId}`}
              value={question}
              maxLength={120}
              rows={2}
              placeholder="例：已知它喜湿、根须又薄，下一阶段更适合温养还是强催？"
              onChange={(event) => setQuestion(event.target.value)}
              className="border-ink/15 bg-bgpaper/70 focus-visible:outline-crimson w-full resize-y border px-3 py-2 text-sm leading-6 focus-visible:outline-2"
            />
            <InkButton
              type="submit"
              variant="secondary"
              disabled={
                props.busy ||
                question.trim().length < 2 ||
                (plot.questionAllowance?.used ?? 0) >=
                  (plot.questionAllowance?.limit ?? 2)
              }
            >
              送出问话
            </InkButton>
          </form>
        </div>
      ) : null}

      {needsDecision ? (
        <div className="border-ink/10 mt-5 space-y-4 border-t pt-4">
          {plot.status === 'empty' ? (
            <QuietSelect
              label="选择灵种"
              value={selectedSeedId}
              onChange={setSeedId}
              options={state.seeds.map((seed) => ({
                value: seed.materialId,
                label: `${seed.name} · ${seed.rank} · 余 ${seed.quantity}${seed.lockedReason ? ` · ${seed.lockedReason}` : ''}`,
                disabled: !seed.plantable,
              }))}
            />
          ) : null}
          <div>
            <p className="text-ink-secondary mb-2 text-xs">
              {plot.status === 'empty'
                ? '选择启灵方式 · 方法会改变环境与培育节奏'
                : '根据已知线索选择下一阶段方式'}
            </p>
            <div className="border-ink/10 border-t">
              {methodOptions.map((entry) => {
                const selected = entry.id === selectedActionId;
                const effects = methodEffectLabels(entry);
                const verified = latestMethodAssessment(entry.id, plot.history);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setActionId(entry.id)}
                    className={cn(
                      'border-ink/10 hover:bg-ink/[0.035] flex w-full items-start justify-between gap-4 border-b px-1 py-3 text-left transition-colors',
                      selected && 'text-crimson bg-crimson/[0.035]',
                    )}
                  >
                    <span className="min-w-0">
                      <strong className="block text-sm font-normal">
                        {entry.name}
                      </strong>
                      <span className="text-ink-secondary mt-1 block text-xs leading-5">
                        {effects.join(' · ')}
                      </span>
                      <span className="text-ink-secondary mt-1 block text-xs leading-5">
                        {entry.description}
                      </span>
                      {verified ? (
                        <span className="mt-1 block text-xs">
                          已验证反馈：{assessmentCopy(verified).label}
                        </span>
                      ) : plot.status !== 'empty' ? (
                        <span className="text-ink-secondary mt-1 block text-xs">
                          尚未用此法验证；请结合上方线索判断。
                        </span>
                      ) : null}
                    </span>
                    {'cost' in entry ? (
                      <span className="text-ink-secondary shrink-0 text-xs">
                        {costLabel(entry)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
          {materialType ? (
            <QuietSelect
              label={`选择${materialTypeLabel(materialType)}`}
              value={selectedMaterialId}
              onChange={setMaterialId}
              options={materials.map((material) => ({
                value: material.materialId,
                label: `${material.name} · ${material.rank} · 余 ${material.quantity}`,
              }))}
            />
          ) : null}
          {method?.requiresRoot ? (
            <QuietSelect
              label="选择本命灵根"
              value={selectedRootElement}
              onChange={(value) => setRootElement(value as ElementType)}
              options={state.spiritualRoots.map((root) => ({
                value: root.element,
                label: `${root.element}灵根 · 强度 ${root.strength}`,
              }))}
            />
          ) : null}
          <InkButton
            variant="primary"
            disabled={submitDisabled}
            onClick={() => {
              if (!selectedActionId) return;
              const operation =
                plot.status === 'empty'
                  ? props.onPlant(
                      selectedSeedId,
                      selectedActionId,
                      selectedMaterialId || undefined,
                      selectedRootElement || undefined,
                    )
                  : props.onCultivate(
                      selectedActionId,
                      selectedMaterialId || undefined,
                      selectedRootElement || undefined,
                    );
              void operation.catch(() => undefined);
            }}
          >
            {props.busy
              ? '药园执事正在结算草木反应'
              : plot.status === 'empty'
                ? '确认播种并启灵'
                : actionStage === 'formation'
                  ? '确认凝华方向'
                  : '确认本轮培育'}
          </InkButton>
        </div>
      ) : null}

      {state.owner.isSelf && plot.status === 'ready' ? (
        <HarvestSummary plot={plot} />
      ) : null}

      {plot.history?.length ? (
        <CultivationJournal history={plot.history} />
      ) : null}
    </NpcConversation>
  );
}

function GardenKnowledge({ plot }: { plot: HerbGardenPlotView }) {
  const observations = latestObservations(plot.history);
  const cultivation =
    plot.history?.filter((record) => record.kind !== 'observation' && record.kind !== 'consultation') ?? [];
  return (
    <div className="border-ink/10 mt-4 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">当前认知</p>
        <span className="text-ink-secondary text-xs">
          隐藏种性不会直接揭示
        </span>
      </div>
      {observations.length ? (
        <div className="mt-3 space-y-2">
          {observations.map((record) => (
            <div key={record.recordId} className="text-xs leading-5">
              <span className="text-ink-secondary">
                {record.observationName}：
              </span>
              <span>{record.safeFact}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-ink-secondary mt-2 text-xs leading-5">
          还没有主动辨察过这株灵植。观察不会直接给答案，而是逐步补全可用于判断的线索。
        </p>
      )}
      {cultivation.length ? (
        <div className="text-ink-secondary mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {cultivation.map((record) => (
            <span key={record.recordId}>
              {STAGE_NAMES[record.stage]} · {record.actionName}：
              {assessmentCopy(record.assessment).label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ObservationTools({
  plot,
  busy,
  onObserve,
}: {
  plot: HerbGardenPlotView;
  busy: boolean;
  onObserve(observation: HerbGardenObservationKind): Promise<void>;
}) {
  const currentStage =
    plot.stage && plot.stage !== 'ready' ? plot.stage : undefined;
  const observed = new Set(
    (plot.history ?? [])
      .filter(
        (record) =>
          record.kind === 'observation' && record.stage === currentStage,
      )
      .map((record) => record.observation),
  );
  const used = plot.observationAllowance?.used ?? observed.size;
  const limit = plot.observationAllowance?.limit ?? 3;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="text-ink-secondary">
          辨察草木 · 四项中任选三项，每项本阶段仅一次
        </span>
        <span className="text-ink-secondary">
          {used}/{limit}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['appearance', '察叶色'],
            ['aura', '辨灵气'],
            ['soil', '验土性'],
            ['root', '探根须'],
          ] as const
        ).map(([value, label]) => {
          const done = observed.has(value);
          return (
            <InkButton
              key={value}
              variant="secondary"
              disabled={busy || done || used >= limit}
              onClick={() => void onObserve(value).catch(() => undefined)}
            >
              {done ? `✓ ${label}` : label}
            </InkButton>
          );
        })}
      </div>
      <p className="text-ink-secondary mt-2 text-xs leading-5">
        留下一项未知是正常选择；请根据你最想确认的风险来分配辨察机会。
      </p>
    </div>
  );
}

function HarvestSummary({ plot }: { plot: HerbGardenPlotView }) {
  if (!plot.outcomePreview) return null;
  const cultivation =
    plot.history?.filter((record) => record.kind !== 'observation' && record.kind !== 'consultation') ?? [];
  const favorable = cultivation.filter(
    (record) =>
      record.assessment === 'resonant' || record.assessment === 'aligned',
  ).length;
  const conflicts = cultivation.filter(
    (record) => record.assessment === 'conflict',
  ).length;
  const formation = cultivation.find((record) => record.stage === 'formation');
  const outcomeLabel = outcomeKindLabel(plot.outcomePreview.kind);
  const qualityDelta = plot.seedRank
    ? QUALITY_ORDER[plot.outcomePreview.rank] - QUALITY_ORDER[plot.seedRank]
    : 0;
  const growthSummary = conflicts
    ? `培育过程中有 ${conflicts} 个阶段出现相冲，最终结果仍受到此前积累影响`
    : favorable >= 2
      ? '多数阶段的选择都顺应了种性，整体长势较好'
      : '各阶段总体保持平稳，未形成明显的连续优势';
  const formationSummary = formation
    ? `${formation.actionName}的本轮反馈为${assessmentCopy(formation.assessment).label.replace(/^[◎○·×]\s*/, '')}`
    : '凝华阶段按既定方向完成';
  const qualitySummary =
    qualityDelta > 0
      ? '最终品阶较原种提升一阶。'
      : qualityDelta < 0
        ? '最终品阶较原种下降一阶。'
        : '最终品阶保持原种品阶。';

  return (
    <div className="border-ink/10 mt-5 border-t pt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm">草木结录</p>
          <p className="text-ink-secondary mt-1 text-xs">
            这份结果来自三阶段选择与最终凝华方向，不是单次随机掉落。
          </p>
        </div>
        <span className="text-sm">
          {plot.outcomePreview.rank} · {plot.outcomePreview.name} ×
          {plot.remainingYield ?? 0}
        </span>
      </div>
      {cultivation.length ? (
        <div className="border-ink/10 mt-3 border-t">
          {cultivation.map((record) => (
            <div
              key={record.recordId}
              className="border-ink/10 flex items-center justify-between gap-4 border-b py-2 text-xs"
            >
              <span>
                {STAGE_NAMES[record.stage]} · {record.actionName}
              </span>
              <span
                className={
                  record.assessment === 'conflict'
                    ? 'text-crimson'
                    : 'text-ink-secondary'
                }
              >
                {assessmentCopy(record.assessment).label}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-xs leading-6">
        形成原因：{growthSummary}；{formationSummary}，最终凝成
        {outcomeLabel}「{plot.outcomePreview.name}」。{qualitySummary}
      </p>
    </div>
  );
}

function CultivationJournal({
  history,
}: {
  history: NonNullable<HerbGardenPlotView['history']>;
}) {
  return (
    <div className="border-ink/10 mt-5 border-t pt-4">
      <p className="text-ink-secondary mb-2 text-xs">完整培育札记</p>
      <div className="space-y-3">
        {history.map((record) => {
          if (record.kind === 'observation') {
            return (
              <div
                key={record.recordId}
                className="border-ink/10 border-b pb-3 last:border-0"
              >
                <p className="text-sm">
                  {STAGE_NAMES[record.stage]} · {record.observationName}
                </p>
                <p className="text-ink-secondary mt-1 text-xs leading-5">
                  线索：{record.safeFact}
                </p>
                {record.narrative !== record.safeFact ? (
                  <p className="mt-1 text-xs leading-5">{record.narrative}</p>
                ) : null}
              </div>
            );
          }
          if (record.kind === 'consultation') {
            return (
              <div
                key={record.recordId}
                className="border-ink/10 border-b pb-3 last:border-0"
              >
                <p className="text-sm">
                  {STAGE_NAMES[record.stage]} · 请教执事
                </p>
                <p className="text-ink-secondary mt-1 text-xs leading-5">
                  问：{record.question}
                </p>
                <p className="mt-1 text-xs leading-5">答：{record.reply}</p>
              </div>
            );
          }
          const assessment = assessmentCopy(record.assessment);
          return (
            <div
              key={record.recordId}
              className="border-ink/10 border-b pb-3 last:border-0"
            >
              <div className="flex items-center justify-between gap-4 text-sm">
                <span>
                  {STAGE_NAMES[record.stage]} · {record.actionName}
                </span>
                <span
                  className={
                    record.assessment === 'conflict'
                      ? 'text-crimson'
                      : 'text-ink-secondary'
                  }
                >
                  {assessment.label}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5">{assessment.detail}</p>
              <p className="text-ink-secondary mt-1 text-xs leading-5">
                征兆：{record.discoveredHint}
              </p>
              <p className="mt-1 text-xs leading-5">{record.narrative}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SeedList({ state }: { state: HerbGardenState }) {
  return state.seeds.length ? (
    <div className="border-ink/10 border-t">
      {state.seeds.map((seed) => (
        <div key={seed.materialId} className="border-ink/10 border-b py-3">
          <div className="flex justify-between gap-4 text-sm">
            <span>
              {seed.name} · {seed.rank}
            </span>
            <span className="text-ink-secondary">余 {seed.quantity}</span>
          </div>
          <p className="text-ink-secondary mt-1 text-xs leading-5">
            {seed.description ?? '种性征兆尚未记入谱录。'}
          </p>
          {seed.lockedReason ? (
            <p className="text-crimson mt-1 text-xs">{seed.lockedReason}</p>
          ) : null}
        </div>
      ))}
    </div>
  ) : (
    <p className="text-ink-secondary text-sm leading-7">
      灵种匣目前为空。可从副本、每日历练、坊市或宗门宝库取得种子。
    </p>
  );
}

function GardenLogs({ state }: { state: HerbGardenState }) {
  return state.logs.length ? (
    <div className="border-ink/10 border-t">
      {state.logs.map((log) => (
        <div key={log.id} className="border-ink/10 border-b py-3">
          <p className="text-sm leading-6">{log.message}</p>
          <p className="text-ink-secondary mt-1 text-xs">
            {new Date(log.createdAt).toLocaleString('zh-CN')}
          </p>
        </div>
      ))}
    </div>
  ) : (
    <p className="text-ink-secondary text-sm">田间近日清静。</p>
  );
}

function FriendList({
  state,
  onVisit,
}: {
  state: HerbGardenState;
  onVisit(cultivatorId: string): void;
}) {
  return state.friends.length ? (
    <div className="border-ink/10 border-t">
      {state.friends.map((friend) => (
        <button
          key={friend.cultivatorId}
          type="button"
          onClick={() => onVisit(friend.cultivatorId)}
          className="border-ink/10 hover:bg-ink/[0.035] flex w-full justify-between border-b py-3 text-left text-sm transition-colors"
        >
          <span>
            {friend.name} · {friend.realm}
          </span>
          <span
            className={
              friend.readyPlots ? 'text-crimson' : 'text-ink-secondary'
            }
          >
            {friend.readyPlots
              ? `${friend.readyPlots} 畦成熟`
              : friend.growingPlots
                ? `${friend.growingPlots} 畦生长中`
                : '田间空置'}
          </span>
        </button>
      ))}
    </div>
  ) : (
    <p className="text-ink-secondary text-sm">结识道友后即可互访灵田。</p>
  );
}

function QuietSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  onChange(value: string): void;
}) {
  return (
    <label className="block">
      <span className="text-ink-secondary mb-2 block text-xs">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-ink/15 bg-bgpaper/70 focus-visible:outline-crimson w-full border px-3 py-2 text-sm focus-visible:outline-2"
      >
        {!options.length ? <option value="">暂无可选项</option> : null}
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function latestObservations(
  history?: HerbGardenJournalEntry[],
): Extract<HerbGardenJournalEntry, { kind: 'observation' }>[] {
  const latest = new Map<
    HerbGardenObservationKind,
    Extract<HerbGardenJournalEntry, { kind: 'observation' }>
  >();
  for (const record of history ?? []) {
    if (record.kind === 'observation') latest.set(record.observation, record);
  }
  return [...latest.values()];
}

function latestMethodAssessment(
  actionId: HerbGardenActionId,
  history?: HerbGardenJournalEntry[],
): StageAssessment | undefined {
  const record = [...(history ?? [])]
    .reverse()
    .find(
      (entry) =>
        entry.kind !== 'observation' &&
        entry.kind !== 'consultation' &&
        entry.actionId === actionId,
    );
  return record?.assessment;
}

function assessmentCopy(assessment: StageAssessment) {
  return ASSESSMENT_COPY[assessment];
}

function methodEffectLabels(entry: GardenMethodOption): string[] {
  if (!('cost' in entry)) {
    const labels: Record<FormationMethodDefinition['id'], string[]> = {
      leaf_medicine: ['稳定成药', '产量优先'],
      fruit_bloom: ['尝试灵果', '依赖此前长势'],
      treasure_return: ['尝试天材地宝', '品质与长势要求高'],
      natural_form: ['顺应隐藏种性', '不强定产物形态'],
    };
    return labels[entry.id];
  }
  return [
    ...new Set([
      ...entry.methodTags.flatMap((tag) =>
        METHOD_TAG_LABELS[tag] ? [METHOD_TAG_LABELS[tag]!] : [],
      ),
      ...entry.environmentTags.flatMap((tag) =>
        ENVIRONMENT_TAG_LABELS[tag] ? [ENVIRONMENT_TAG_LABELS[tag]!] : [],
      ),
    ]),
  ];
}

function outcomeKindLabel(kind: HerbGardenPlotView['outcomePreview'] extends infer T
  ? T extends { kind: infer K }
    ? K
    : never
  : never): string {
  if (kind === 'spirit_fruit') return '灵果';
  if (kind === 'tcdb') return '天材地宝';
  return '灵药';
}

function costLabel(method: CultivationMethodDefinition): string {
  const cost = method.cost;
  if (cost.kind === 'time') return '不耗资源';
  if (cost.kind === 'qi') return `${cost.amount} 天地灵气`;
  if (cost.kind === 'spirit_stones') return `${cost.amount} 灵石`;
  if (cost.kind === 'mp') return `${cost.amount} 法力`;
  const material = `${cost.amount} 份${materialTypeLabel(cost.materialType)}`;
  return cost.spiritStones
    ? `${material}，${cost.spiritStones} 灵石`
    : material;
}

function materialTypeLabel(type: Exclude<MaterialType, 'seed'>): string {
  const labels: Partial<Record<MaterialType, string>> = {
    herb: '药材',
    ore: '矿石',
    monster: '妖兽材料',
    aux: '辅材',
    tcdb: '天材地宝',
    gongfa_manual: '功法典籍',
    skill_manual: '神通典籍',
  };
  return labels[type] ?? '材料';
}

function plotStatusText(plot: HerbGardenPlotView): string {
  if (plot.status === 'empty') return '空畦';
  if (plot.status === 'ready') return '成熟';
  if (plot.status === 'awaiting_action') return '待择法';
  return STAGE_NAMES[plot.stage ?? 'germination'];
}

function formatRemaining(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  if (minutes <= 0) return '片刻';
  if (minutes < 60) return `${minutes} 分钟`;
  return `${Math.floor(minutes / 60)} 时 ${minutes % 60} 分`;
}
