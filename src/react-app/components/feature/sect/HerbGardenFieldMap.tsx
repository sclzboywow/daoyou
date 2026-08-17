import { InkButton } from '@app/components/ui/InkButton';
import { InkDetailDrawer } from '@app/components/ui/InkDetailDrawer';
import type {
  HerbGardenPlotView,
  HerbGardenState,
} from '@shared/contracts/herbGarden';
import { useEffect, useMemo, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';

const PLOT_POSITIONS = [
  { left: '20%', top: '66%', rotate: '-4deg' },
  { left: '37%', top: '61%', rotate: '2deg' },
  { left: '54%', top: '67%', rotate: '-2deg' },
  { left: '70%', top: '58%', rotate: '3deg' },
  { left: '37%', top: '43%', rotate: '-3deg' },
  { left: '58%', top: '38%', rotate: '2deg' },
] as const;

const PLOT_NAMES = ['溪畔一畦', '青石二畦', '竹影三畦', '南坡四畦', '云阶五畦', '灵泉六畦'];

function formatRemaining(ms: number): string {
  if (ms <= 0) return '即将成熟';
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

function plotProgress(plot: HerbGardenPlotView, now: number): number {
  if (!plot.plantedAt || !plot.readyAt) return 0.35;
  const start = new Date(plot.plantedAt).getTime();
  const end = new Date(plot.readyAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0.5;
  return Math.max(0, Math.min(1, (now - start) / (end - start)));
}

function plotPhase(plot: HerbGardenPlotView, now: number): string {
  if (plot.status === 'empty') return '空畦';
  if (plot.status === 'ready') return '可收获';
  if (plot.status === 'awaiting_action') return '顺势生长';
  const progress = plotProgress(plot, now);
  if (progress < 0.28) return '萌芽';
  if (progress < 0.72) return '生长';
  return '将熟';
}

function PlantGlyph({ plot, now }: { plot: HerbGardenPlotView; now: number }) {
  if (plot.status === 'empty')
    return <span className="text-ink-secondary text-xl leading-none">＋</span>;
  if (plot.status === 'ready')
    return (
      <span className="relative block h-9 w-10" aria-hidden="true">
        <span className="absolute bottom-0 left-1/2 h-7 w-px -translate-x-1/2 bg-emerald-900/65" />
        <span className="absolute top-1 left-1 h-5 w-5 -rotate-[24deg] rounded-[80%_15%_70%_25%] border border-emerald-900/45 bg-emerald-700/35" />
        <span className="absolute top-0 right-1 h-5 w-5 rotate-[24deg] rounded-[15%_80%_25%_70%] border border-emerald-900/45 bg-emerald-700/35" />
        <span className="absolute top-3 left-1/2 size-2 -translate-x-1/2 rounded-full bg-amber-500/70 shadow-[0_0_10px_rgba(180,115,20,0.55)]" />
      </span>
    );
  const progress = plotProgress(plot, now);
  const height = progress < 0.28 ? 'h-4' : progress < 0.72 ? 'h-7' : 'h-9';
  return (
    <span className={`relative block w-9 ${height}`} aria-hidden="true">
      <span className="absolute bottom-0 left-1/2 h-full w-px -translate-x-1/2 bg-emerald-900/55" />
      <span className="absolute bottom-1 left-1/2 h-4 w-4 -translate-x-[95%] -rotate-[28deg] rounded-[80%_15%_70%_25%] border border-emerald-900/35 bg-emerald-700/25" />
      {progress >= 0.45 ? (
        <span className="absolute top-1 left-1/2 h-4 w-4 -translate-x-[5%] rotate-[26deg] rounded-[15%_80%_25%_70%] border border-emerald-900/35 bg-emerald-700/25" />
      ) : null}
    </span>
  );
}

function FieldBackdrop() {
  return (
    <svg
      viewBox="0 0 1600 900"
      className="pointer-events-none block h-full w-full select-none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="field-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ece7d5" />
          <stop offset="1" stopColor="#d9dfc8" />
        </linearGradient>
        <linearGradient id="field-earth" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c9b98f" />
          <stop offset="1" stopColor="#a99468" />
        </linearGradient>
        <linearGradient id="field-water" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b8cfc7" stopOpacity="0.3" />
          <stop offset="0.5" stopColor="#7ea9a2" stopOpacity="0.58" />
          <stop offset="1" stopColor="#b8cfc7" stopOpacity="0.2" />
        </linearGradient>
        <filter id="paper-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="noise" />
          <feColorMatrix in="noise" type="saturate" values="0" result="mono" />
          <feComponentTransfer in="mono" result="faded">
            <feFuncA type="table" tableValues="0 0.08" />
          </feComponentTransfer>
          <feBlend in="SourceGraphic" in2="faded" mode="multiply" />
        </filter>
      </defs>
      <rect width="1600" height="900" fill="url(#field-sky)" />
      <g filter="url(#paper-noise)">
        <path d="M0 260 C170 150 260 170 385 250 C500 120 650 145 760 250 C910 130 1050 170 1160 255 C1290 160 1440 165 1600 275 L1600 0 L0 0Z" fill="#afb99e" opacity="0.42" />
        <path d="M0 355 C180 245 330 300 455 365 C610 245 770 280 900 360 C1040 260 1210 275 1320 355 C1430 300 1515 310 1600 350 L1600 0 L0 0Z" fill="#8fa08c" opacity="0.28" />
        <path d="M0 480 C255 400 390 430 565 500 C730 415 920 420 1095 492 C1285 420 1440 430 1600 500 L1600 900 L0 900Z" fill="#c2b58d" opacity="0.82" />
        <path d="M720 280 C690 390 660 450 692 530 C725 612 680 710 612 900" fill="none" stroke="url(#field-water)" strokeWidth="54" strokeLinecap="round" />
        <path d="M725 285 C696 390 676 455 704 528 C735 608 694 715 628 900" fill="none" stroke="#f3f1de" strokeOpacity="0.32" strokeWidth="6" strokeLinecap="round" />
        <path d="M90 795 C255 735 380 760 520 804" fill="none" stroke="#7b6546" strokeOpacity="0.35" strokeWidth="8" strokeLinecap="round" />
        <path d="M960 748 C1130 692 1310 700 1510 760" fill="none" stroke="#7b6546" strokeOpacity="0.32" strokeWidth="8" strokeLinecap="round" />
        <g fill="url(#field-earth)" stroke="#6f6047" strokeOpacity="0.45" strokeWidth="4">
          <ellipse cx="320" cy="595" rx="148" ry="58" transform="rotate(-4 320 595)" />
          <ellipse cx="592" cy="550" rx="148" ry="57" transform="rotate(2 592 550)" />
          <ellipse cx="865" cy="600" rx="148" ry="58" transform="rotate(-2 865 600)" />
          <ellipse cx="1120" cy="520" rx="145" ry="57" transform="rotate(3 1120 520)" />
          <ellipse cx="590" cy="388" rx="143" ry="55" transform="rotate(-3 590 388)" />
          <ellipse cx="930" cy="342" rx="145" ry="55" transform="rotate(2 930 342)" />
        </g>
        <g stroke="#6f6047" strokeOpacity="0.24" strokeWidth="3" fill="none">
          <path d="M205 584 C272 566 360 565 430 590" />
          <path d="M477 540 C552 520 635 520 708 548" />
          <path d="M750 590 C830 570 905 570 978 596" />
          <path d="M1005 510 C1080 491 1165 490 1238 519" />
          <path d="M475 380 C548 360 632 358 705 386" />
          <path d="M815 334 C890 315 972 313 1045 340" />
        </g>
        <g fill="#49654b" opacity="0.48">
          <circle cx="138" cy="530" r="38" />
          <circle cx="1450" cy="480" r="45" />
          <circle cx="1285" cy="305" r="32" />
          <circle cx="240" cy="355" r="30" />
        </g>
        <g stroke="#4d5945" strokeWidth="8" strokeLinecap="round" opacity="0.5">
          <path d="M139 530 L134 615" />
          <path d="M1450 480 L1442 580" />
          <path d="M1285 305 L1280 380" />
          <path d="M240 355 L236 425" />
        </g>
        <path d="M1210 650 L1325 650 L1350 720 L1185 720Z" fill="#8c7553" opacity="0.58" />
        <path d="M1180 650 L1268 592 L1360 650Z" fill="#6e5941" opacity="0.68" />
        <rect x="1238" y="674" width="36" height="46" fill="#493d31" opacity="0.6" />
        <circle cx="760" cy="247" r="48" fill="#89aea5" opacity="0.35" />
        <circle cx="760" cy="247" r="26" fill="#dbe9df" opacity="0.5" />
      </g>
      <text x="83" y="115" fill="#5d654e" opacity="0.55" fontSize="30" letterSpacing="12">灵田谷</text>
      <text x="85" y="154" fill="#6c6758" opacity="0.42" fontSize="18" letterSpacing="5">一溪引灵 · 六畦随时</text>
    </svg>
  );
}

export interface HerbGardenFieldMapProps {
  state: HerbGardenState;
  busy: boolean;
  onSow(slot: number, seedMaterialId: string): Promise<void>;
  onHarvest(plotId: string): Promise<void>;
  onHarvestAll(): Promise<void>;
  onResumeLegacy(plot: HerbGardenPlotView): Promise<void>;
}

export function HerbGardenFieldMap({
  state,
  busy,
  onSow,
  onHarvest,
  onHarvestAll,
  onResumeLegacy,
}: HerbGardenFieldMapProps) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [seedId, setSeedId] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedPlot =
    state.plots.find((plot) => plot.slot === selectedSlot) ?? null;
  const plantableSeeds = useMemo(
    () => state.seeds.filter((seed) => seed.plantable && seed.quantity > 0),
    [state.seeds],
  );
  const activeSeedId = plantableSeeds.some((seed) => seed.materialId === seedId)
    ? seedId
    : (plantableSeeds[0]?.materialId ?? '');
  const activeSeed =
    plantableSeeds.find((seed) => seed.materialId === activeSeedId) ?? null;

  const growing = state.plots.filter(
    (plot) => plot.status === 'cultivating' || plot.status === 'awaiting_action',
  ).length;
  const ready = state.summary.ready;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-current/10 pb-3 text-sm">
        <p className="text-ink-secondary">
          六畦灵土 · {growing} 畦生长中 · {ready} 畦可收获
        </p>
        {ready > 0 ? (
          <InkButton
            variant="primary"
            disabled={busy}
            onClick={() => void onHarvestAll().catch(() => undefined)}
          >
            收取全部成熟灵植
          </InkButton>
        ) : null}
      </div>

      <TransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={2.7}
        centerOnInit
        limitToBounds
        wheel={{ step: 0.16 }}
        panning={{ velocityDisabled: true, excluded: ['herb-field-plot'] }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <div className="relative">
            <div className="border-ink/15 relative overflow-hidden border bg-[#ded8bd] shadow-inner">
              <TransformComponent
                wrapperClass="!w-full !h-[min(58svh,520px)] !min-h-[350px] md:!h-auto md:!min-h-0 md:aspect-[16/9] cursor-grab active:cursor-grabbing"
                contentClass="!w-max !h-max md:!w-full md:!h-full"
              >
                <div className="relative aspect-[16/9] w-[780px] md:w-full">
                  <FieldBackdrop />
                  {state.plots.map((plot, index) => {
                    const position = PLOT_POSITIONS[index];
                    const phase = plotPhase(plot, now);
                    const readyPlot = plot.status === 'ready';
                    const empty = plot.status === 'empty';
                    return (
                      <button
                        key={plot.slot}
                        type="button"
                        onClick={() => setSelectedSlot(plot.slot)}
                        style={{
                          left: position.left,
                          top: position.top,
                          rotate: position.rotate,
                        }}
                        className={`herb-field-plot absolute flex h-[12.5%] w-[17.5%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[50%] border-2 px-2 text-center shadow-sm backdrop-blur-[1px] transition hover:-translate-y-[54%] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 ${
                          readyPlot
                            ? 'border-amber-700/65 bg-amber-100/55 text-amber-950 focus-visible:outline-amber-800'
                            : empty
                              ? 'border-stone-700/35 bg-stone-100/25 text-ink focus-visible:outline-crimson'
                              : 'border-emerald-900/45 bg-emerald-100/35 text-emerald-950 focus-visible:outline-emerald-900'
                        }`}
                        aria-label={`${PLOT_NAMES[index]}，${plot.seedName ?? phase}，${phase}`}
                      >
                        <PlantGlyph plot={plot} now={now} />
                        <strong className="mt-0.5 text-[11px] leading-4 font-semibold sm:text-xs">
                          {plot.seedName ?? PLOT_NAMES[index]}
                        </strong>
                        <span className="text-[10px] leading-3 opacity-75 sm:text-[11px]">
                          {phase}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </TransformComponent>
            </div>

            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-2.5 md:p-3">
              <p className="bg-paper/80 text-ink-secondary hidden px-2.5 py-2 text-sm shadow-sm backdrop-blur-sm md:block">
                拖动或缩放灵田，直接点选田畦查看生长状态。
              </p>
              <div className="border-ink/15 bg-paper/85 pointer-events-auto ml-auto flex border shadow-sm backdrop-blur-sm">
                <button type="button" aria-label="缩小灵田" className="text-ink-secondary hover:text-crimson size-10 text-xl" onClick={() => zoomOut()}>−</button>
                <span className="bg-ink/10 my-2 w-px" aria-hidden="true" />
                <button type="button" aria-label="放大灵田" className="text-ink-secondary hover:text-crimson size-10 text-xl" onClick={() => zoomIn()}>＋</button>
                <span className="bg-ink/10 my-2 w-px" aria-hidden="true" />
                <button type="button" aria-label="复位灵田" className="text-ink-secondary hover:text-crimson size-10 text-base" onClick={() => resetTransform()}>↺</button>
              </div>
            </div>

            <p className="bg-paper/80 text-ink-secondary pointer-events-none absolute bottom-2.5 left-2.5 z-10 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur-sm md:hidden">
              单指拖动 · 双指缩放 · 点田畦操作
            </p>
          </div>
        )}
      </TransformWrapper>

      <p className="text-ink-secondary text-xs leading-6">
        灵种入土后会自行生长，无需逐阶段浇灌或择法；成熟后回来收取即可。
      </p>

      <InkDetailDrawer
        isOpen={selectedPlot !== null}
        onClose={() => setSelectedSlot(null)}
        title={
          selectedPlot
            ? `${PLOT_NAMES[selectedPlot.slot - 1]} · ${plotPhase(selectedPlot, now)}`
            : '灵畦'
        }
        description={selectedPlot?.seedName ?? '灵土已整，可择一枚灵种入土。'}
        size="sm"
        footer={
          selectedPlot?.status === 'empty' ? (
            <InkButton
              variant="primary"
              className="w-full justify-center"
              disabled={busy || !activeSeedId}
              onClick={() => {
                if (!activeSeedId) return;
                void onSow(selectedPlot.slot, activeSeedId)
                  .then(() => {
                    setSelectedSlot(null);
                    setSeedId('');
                  })
                  .catch(() => undefined);
              }}
            >
              {busy ? '灵种入土中……' : activeSeed ? `播下「${activeSeed.name}」` : '暂无可播灵种'}
            </InkButton>
          ) : selectedPlot?.status === 'ready' && selectedPlot.plotId ? (
            <InkButton
              variant="primary"
              className="w-full justify-center"
              disabled={busy}
              onClick={() =>
                void onHarvest(selectedPlot.plotId!)
                  .then(() => setSelectedSlot(null))
                  .catch(() => undefined)
              }
            >
              {busy ? '收取中……' : '收获此畦'}
            </InkButton>
          ) : selectedPlot?.status === 'awaiting_action' && selectedPlot.plotId ? (
            <InkButton
              variant="primary"
              className="w-full justify-center"
              disabled={busy}
              onClick={() =>
                void onResumeLegacy(selectedPlot).catch(() => undefined)
              }
            >
              让旧灵植顺势续长
            </InkButton>
          ) : undefined
        }
      >
        {selectedPlot?.status === 'empty' ? (
          <div className="space-y-4">
            {plantableSeeds.length ? (
              <div className="divide-ink/10 divide-y border-y border-current/10">
                {plantableSeeds.map((seed) => {
                  const selected = seed.materialId === activeSeedId;
                  return (
                    <button
                      key={seed.materialId}
                      type="button"
                      onClick={() => setSeedId(seed.materialId)}
                      className={`w-full px-1 py-3 text-left transition ${selected ? 'text-crimson' : 'hover:bg-ink/[0.03]'}`}
                    >
                      <span className="flex items-center justify-between gap-3 text-sm">
                        <strong className="font-normal">{seed.name}</strong>
                        <span className="text-ink-secondary text-xs">{seed.rank} · 余 {seed.quantity}</span>
                      </span>
                      {seed.description ? (
                        <span className="text-ink-secondary mt-1 block text-xs leading-5">{seed.description}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-ink-secondary text-sm leading-7">
                储物袋里暂时没有当前境界可播的灵种，可先去坊市或宗门库存寻种。
              </p>
            )}
            {state.seeds.some((seed) => !seed.plantable) ? (
              <p className="text-ink-secondary text-xs leading-5">
                更高品阶灵种会保留在灵种匣中，境界达到后即可播种。
              </p>
            ) : null}
          </div>
        ) : selectedPlot ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 border-y border-current/10 py-3 text-sm">
              <div>
                <span className="text-ink-secondary block text-xs">灵种</span>
                <span className="mt-1 block">{selectedPlot.seedName}</span>
              </div>
              <div>
                <span className="text-ink-secondary block text-xs">品阶</span>
                <span className="mt-1 block">{selectedPlot.seedRank ?? '未知'}</span>
              </div>
            </div>
            {selectedPlot.description ? (
              <p className="text-ink-secondary text-sm leading-7">{selectedPlot.description}</p>
            ) : null}

            {selectedPlot.status === 'ready' ? (
              <div className="border-amber-800/20 bg-amber-100/25 border p-4">
                <p className="text-sm">成熟所得</p>
                <p className="mt-2 text-lg">
                  {selectedPlot.outcomePreview?.name ?? '成熟灵植'} × {selectedPlot.remainingYield ?? 0}
                </p>
                <p className="text-ink-secondary mt-1 text-xs">
                  {selectedPlot.outcomePreview?.rank ?? selectedPlot.seedRank}
                </p>
              </div>
            ) : (
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-ink-secondary">{plotPhase(selectedPlot, now)}</span>
                  <span className="text-ink-secondary">
                    {selectedPlot.readyAt
                      ? `尚需约 ${formatRemaining(new Date(selectedPlot.readyAt).getTime() - now)}`
                      : '草木正在生长'}
                  </span>
                </div>
                <div className="bg-ink/10 h-1.5 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full bg-emerald-800/55 transition-[width] duration-500"
                    style={{ width: `${Math.round(plotProgress(selectedPlot, now) * 100)}%` }}
                  />
                </div>
                {selectedPlot.status === 'awaiting_action' ? (
                  <p className="text-ink-secondary mt-3 text-xs leading-5">
                    这是旧版培育流程留下的灵植。点下方按钮后会按新的简化规则继续生长；新播灵种不会再出现阶段选择。
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </InkDetailDrawer>
    </div>
  );
}
