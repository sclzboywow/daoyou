import { GameSceneFrame, GameSceneSection } from '@app/components/game-shell';
import { InkModal } from '@app/components/layout';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import {
  InkActionGroup,
  InkBadge,
  InkButton,
  InkIdentifyCelebration,
  InkNotice,
} from '@app/components/ui';
import { consumeResourceMutation } from '@app/lib/resources/mutations';
import {
  useCultivatorCondition,
  useCultivatorIdentity,
} from '@app/lib/resources/player';
import type {
  BodyCultivationBreakthroughCostRequirement,
  BodyCultivationBreakthroughEligibleData,
  BodyCultivationBreakthroughEligibleResponse,
  BodyCultivationBreakthroughRequest,
} from '@shared/contracts/bodyCultivation';
import type { ApiFailure } from '@shared/contracts/http';
import { previewBodyCultivationRealmBreakthrough } from '@shared/lib/bodyCultivation/breakthrough';
import { BODY_REALM_LABELS } from '@shared/lib/bodyCultivation/config';
import { cn } from '@shared/lib/cn';
import { getMaterialTypeInfo } from '@shared/lib/gameConceptDisplay';
import type { Quality } from '@shared/types/constants';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

type SelectionMap = Record<
  string,
  { quantity: number; requirementLabel: string }
>;

type EligibleMaterial =
  BodyCultivationBreakthroughEligibleData['materials'][number];
type EligibleConsumable =
  BodyCultivationBreakthroughEligibleData['consumables'][number];

type BreakthroughResult = {
  success?: boolean;
  toRealm?: string;
  guaranteeProgress?: number;
};

function getRequirementLabel(
  requirement: Pick<
    BodyCultivationBreakthroughCostRequirement,
    'label' | 'name'
  >,
): string {
  return requirement.label ?? requirement.name;
}

function formatChance(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function getSelectedTotalByRequirement(
  selections: {
    materials: SelectionMap;
    consumables: SelectionMap;
  },
  requirementLabel: string,
): number {
  const materialTotal = Object.values(selections.materials).reduce(
    (sum, selection) =>
      selection.requirementLabel === requirementLabel
        ? sum + selection.quantity
        : sum,
    0,
  );
  const consumableTotal = Object.values(selections.consumables).reduce(
    (sum, selection) =>
      selection.requirementLabel === requirementLabel
        ? sum + selection.quantity
        : sum,
    0,
  );
  return materialTotal + consumableTotal;
}

function buildRequestBody(selections: {
  materials: SelectionMap;
  consumables: SelectionMap;
}): BodyCultivationBreakthroughRequest {
  return {
    materialSelections: Object.entries(selections.materials)
      .filter(([, selection]) => selection.quantity > 0)
      .map(([id, selection]) => ({ id, quantity: selection.quantity })),
    consumableSelections: Object.entries(selections.consumables)
      .filter(([, selection]) => selection.quantity > 0)
      .map(([id, selection]) => ({ id, quantity: selection.quantity })),
  };
}

function CostRequirementList({
  requirements,
  selections,
}: {
  requirements: BodyCultivationBreakthroughCostRequirement[];
  selections: {
    materials: SelectionMap;
    consumables: SelectionMap;
  };
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {requirements.map((requirement) => {
        const label = getRequirementLabel(requirement);
        const selectedQuantity = getSelectedTotalByRequirement(
          selections,
          label,
        );
        const met = selectedQuantity >= requirement.quantity;
        return (
          <div
            key={`${requirement.type}:${label}`}
            className={cn(
              'border-ink/10 bg-bgpaper/70 border border-dashed px-3 py-2 text-sm leading-6',
              met && 'border-wood/35',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink font-medium">{label}</span>
              <InkBadge tone={met ? 'accent' : 'default'}>
                {selectedQuantity}/{requirement.quantity}
              </InkBadge>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SelectionStepper({
  selected,
  disabled,
  onAdd,
  onRemove,
}: {
  selected: number;
  disabled: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <InkButton
        type="button"
        variant="secondary"
        className="h-8 w-8 px-0"
        disabled={selected <= 0}
        onClick={onRemove}
      >
        -
      </InkButton>
      <span className="text-ink min-w-6 text-center text-sm font-medium">
        {selected}
      </span>
      <InkButton
        type="button"
        variant="secondary"
        className="h-8 w-8 px-0"
        disabled={disabled}
        onClick={onAdd}
      >
        +
      </InkButton>
    </div>
  );
}

function MaterialRow({
  item,
  selected,
  requirement,
  requirementSelected,
  onChange,
}: {
  item: EligibleMaterial;
  selected: number;
  requirement: BodyCultivationBreakthroughCostRequirement;
  requirementSelected: number;
  onChange: (quantity: number) => void;
}) {
  const typeInfo = getMaterialTypeInfo(item.type);
  const canAdd =
    item.quantity > selected && requirementSelected < requirement.quantity;

  return (
    <div className="border-ink/10 flex items-center justify-between gap-3 border px-3 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink font-medium">
            {typeInfo.icon} {item.name}
          </span>
          <InkBadge tier={item.rank as Quality} compact>
            {typeInfo.label}
          </InkBadge>
          <span className="text-ink-secondary text-xs">x{item.quantity}</span>
        </div>
        <p className="text-ink-secondary mt-1 text-xs leading-5">
          {item.requirementLabel}
        </p>
      </div>
      <SelectionStepper
        selected={selected}
        disabled={!canAdd}
        onAdd={() => onChange(selected + 1)}
        onRemove={() => onChange(Math.max(0, selected - 1))}
      />
    </div>
  );
}

function ConsumableRow({
  item,
  selected,
  requirement,
  requirementSelected,
  onChange,
}: {
  item: EligibleConsumable;
  selected: number;
  requirement: BodyCultivationBreakthroughCostRequirement;
  requirementSelected: number;
  onChange: (quantity: number) => void;
}) {
  const canAdd =
    item.quantity > selected && requirementSelected < requirement.quantity;

  return (
    <div className="border-ink/10 flex items-center justify-between gap-3 border px-3 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink font-medium">{item.name}</span>
          <InkBadge tier={item.quality as Quality} compact>
            {item.type}
          </InkBadge>
          <span className="text-ink-secondary text-xs">x{item.quantity}</span>
        </div>
        <p className="text-ink-secondary mt-1 text-xs leading-5">
          {item.requirementLabel}
        </p>
      </div>
      <SelectionStepper
        selected={selected}
        disabled={!canAdd}
        onAdd={() => onChange(selected + 1)}
        onRemove={() => onChange(Math.max(0, selected - 1))}
      />
    </div>
  );
}

function SelectionModal({
  isOpen,
  eligible,
  isLoading,
  error,
  requirements,
  selections,
  onClose,
  onRetry,
  onPageChange,
  onSelectionChange,
}: {
  isOpen: boolean;
  eligible: BodyCultivationBreakthroughEligibleData | null;
  isLoading: boolean;
  error: string | null;
  requirements: BodyCultivationBreakthroughCostRequirement[];
  selections: {
    materials: SelectionMap;
    consumables: SelectionMap;
  };
  onClose: () => void;
  onRetry: () => void;
  onPageChange: (kind: 'materials' | 'consumables', page: number) => void;
  onSelectionChange: (
    type: 'materials' | 'consumables',
    id: string,
    quantity: number,
    requirementLabel: string,
  ) => void;
}) {
  const requirementByLabel = useMemo(
    () =>
      new Map(
        requirements.map((requirement) => [
          getRequirementLabel(requirement),
          requirement,
        ]),
      ),
    [requirements],
  );

  return (
    <InkModal
      isOpen={isOpen}
      onClose={onClose}
      title="选取破限资材"
      className="max-w-3xl"
      footer={
        <InkActionGroup align="between" className="mt-0">
          <span className="text-ink-secondary text-xs leading-8">
            已选 {buildRequestBody(selections).materialSelections.length}{' '}
            类材料，
            {buildRequestBody(selections).consumableSelections.length} 类丹药
          </span>
          <InkButton variant="primary" onClick={onClose}>
            完成选取
          </InkButton>
        </InkActionGroup>
      }
    >
      <div className="space-y-4">
        {isLoading ? <InkNotice>正在检索可用资材……</InkNotice> : null}
        {error ? (
          <InkNotice tone="danger">
            {error}
            <InkButton
              type="button"
              variant="secondary"
              className="ml-2"
              onClick={onRetry}
            >
              重试
            </InkButton>
          </InkNotice>
        ) : null}
        {!isLoading && !error && eligible ? (
          <>
            <section className="space-y-2">
              <h3 className="text-ink text-sm font-semibold">材料</h3>
              {eligible.materials.length === 0 ? (
                <InkNotice>暂无符合本次破限要求的材料。</InkNotice>
              ) : (
                <div className="space-y-2">
                  {eligible.materials.map((item) => {
                    const requirement = requirementByLabel.get(
                      item.requirementLabel,
                    );
                    if (!requirement) return null;
                    const requirementSelected = getSelectedTotalByRequirement(
                      selections,
                      item.requirementLabel,
                    );
                    return (
                      <MaterialRow
                        key={item.id}
                        item={item}
                        selected={selections.materials[item.id]?.quantity ?? 0}
                        requirement={requirement}
                        requirementSelected={requirementSelected}
                        onChange={(quantity) =>
                          onSelectionChange(
                            'materials',
                            item.id,
                            quantity,
                            item.requirementLabel,
                          )
                        }
                      />
                    );
                  })}
                </div>
              )}
              <CandidatePagination
                pagination={eligible.pagination.materials}
                disabled={isLoading}
                onPageChange={(page) => onPageChange('materials', page)}
              />
            </section>

            <section className="space-y-2">
              <h3 className="text-ink text-sm font-semibold">丹药</h3>
              {eligible.consumables.length === 0 ? (
                <InkNotice>暂无符合本次破限要求的丹药。</InkNotice>
              ) : (
                <div className="space-y-2">
                  {eligible.consumables.map((item) => {
                    const requirement = requirementByLabel.get(
                      item.requirementLabel,
                    );
                    if (!requirement) return null;
                    const requirementSelected = getSelectedTotalByRequirement(
                      selections,
                      item.requirementLabel,
                    );
                    return (
                      <ConsumableRow
                        key={item.id}
                        item={item}
                        selected={
                          selections.consumables[item.id]?.quantity ?? 0
                        }
                        requirement={requirement}
                        requirementSelected={requirementSelected}
                        onChange={(quantity) =>
                          onSelectionChange(
                            'consumables',
                            item.id,
                            quantity,
                            item.requirementLabel,
                          )
                        }
                      />
                    );
                  })}
                </div>
              )}
              <CandidatePagination
                pagination={eligible.pagination.consumables}
                disabled={isLoading}
                onPageChange={(page) => onPageChange('consumables', page)}
              />
            </section>
          </>
        ) : null}
      </div>
    </InkModal>
  );
}

function CandidatePagination({
  pagination,
  disabled,
  onPageChange,
}: {
  pagination: BodyCultivationBreakthroughEligibleData['pagination']['materials'];
  disabled: boolean;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(
    1,
    Math.ceil(pagination.total / pagination.pageSize),
  );
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-1 text-xs">
      <InkButton
        type="button"
        variant="secondary"
        disabled={disabled || pagination.page <= 1}
        onClick={() => onPageChange(pagination.page - 1)}
      >
        上一页
      </InkButton>
      <span className="text-ink-secondary">
        第 {pagination.page} / {totalPages} 页，共 {pagination.total} 件
      </span>
      <InkButton
        type="button"
        variant="secondary"
        disabled={disabled || pagination.page >= totalPages}
        onClick={() => onPageChange(pagination.page + 1)}
      >
        下一页
      </InkButton>
    </div>
  );
}

export default function BodyCultivationBreakthroughPage() {
  const profile = useCultivatorIdentity();
  const condition = useCultivatorCondition();
  const identity = profile.data?.cultivator;
  const cultivator =
    identity && condition.data
      ? { realm: identity.realm, condition: condition.data }
      : null;
  const isLoading = profile.loading || condition.loading;
  const { pushToast } = useInkUI();
  const navigate = useNavigate();
  const [isSelectionOpen, setIsSelectionOpen] = useState(false);
  const [eligible, setEligible] =
    useState<BodyCultivationBreakthroughEligibleData | null>(null);
  const [eligibleError, setEligibleError] = useState<string | null>(null);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const eligibleControllerRef = useRef<AbortController | undefined>(undefined);
  const [eligiblePages, setEligiblePages] = useState({
    materials: 1,
    consumables: 1,
  });
  const [selections, setSelections] = useState<{
    materials: SelectionMap;
    consumables: SelectionMap;
  }>({ materials: {}, consumables: {} });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BreakthroughResult | null>(null);
  const [celebrationTick, setCelebrationTick] = useState(0);

  const preview = cultivator
    ? previewBodyCultivationRealmBreakthrough(cultivator.condition, {
        cultivatorRealm: cultivator.realm,
      })
    : null;
  const nextRealmLabel = preview?.nextRealm
    ? BODY_REALM_LABELS[preview.nextRealm]
    : null;
  const requirements = useMemo(
    () =>
      (preview?.costs ?? []).map((cost) => ({
        type: cost.type,
        name: cost.name,
        label: cost.label,
        quantity: cost.quantity,
        ...(cost.type === 'material'
          ? {
              materialType: cost.materialType,
              minQuality: cost.minQuality,
            }
          : {
              family: cost.family,
              property: cost.property,
              minQuality: cost.minQuality,
            }),
      })),
    [preview],
  );
  const allCostsMet =
    Boolean(eligible) &&
    requirements.length > 0 &&
    requirements.every((requirement) => {
      const label = getRequirementLabel(requirement);
      return (
        getSelectedTotalByRequirement(selections, label) ===
        requirement.quantity
      );
    });

  const loadEligible = async (pages = eligiblePages) => {
    eligibleControllerRef.current?.abort();
    const controller = new AbortController();
    eligibleControllerRef.current = controller;
    setEligibleLoading(true);
    setEligibleError(null);
    try {
      const query = new URLSearchParams({
        materialPage: String(pages.materials),
        consumablePage: String(pages.consumables),
        pageSize: '20',
      });
      const response = await fetch(
        `/api/cultivator/body-cultivation/breakthrough/eligible?${query.toString()}`,
        { signal: controller.signal },
      );
      const payload = (await response.json()) as
        BodyCultivationBreakthroughEligibleResponse | ApiFailure;
      if (!response.ok || !payload.success) {
        throw new Error('error' in payload ? payload.error : '资材读取失败');
      }
      setEligible(payload.data);
      setEligiblePages({
        materials: payload.data.pagination.materials.page,
        consumables: payload.data.pagination.consumables.page,
      });
    } catch (caught) {
      if (controller.signal.aborted) return;
      setEligibleError(
        caught instanceof Error ? caught.message : '资材读取失败',
      );
    } finally {
      if (!controller.signal.aborted) setEligibleLoading(false);
    }
  };

  useEffect(
    () => () => {
      eligibleControllerRef.current?.abort();
    },
    [],
  );

  const openSelection = () => {
    setIsSelectionOpen(true);
    if (!eligible && !eligibleLoading) {
      void loadEligible();
    }
  };

  const handleSelectionChange = (
    type: 'materials' | 'consumables',
    id: string,
    quantity: number,
    requirementLabel: string,
  ) => {
    setSelections((prev) => {
      const next = { ...prev[type] };
      if (quantity > 0) next[id] = { quantity, requirementLabel };
      else delete next[id];
      return { ...prev, [type]: next };
    });
  };

  const handleEligiblePageChange = (
    kind: 'materials' | 'consumables',
    page: number,
  ) => {
    const pages = { ...eligiblePages, [kind]: page };
    setEligiblePages(pages);
    void loadEligible(pages);
  };

  const submitBreakthrough = async () => {
    if (!allCostsMet || submitting) return;

    setSubmitting(true);
    try {
      const response = await fetch(
        '/api/cultivator/body-cultivation/breakthrough',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildRequestBody(selections)),
        },
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || '肉身破限失败');
      }

      await consumeResourceMutation(payload);
      const nextResult = payload.data as BreakthroughResult;
      setResult(nextResult);
      setSelections({ materials: {}, consumables: {} });
      setEligible(null);
      if (nextResult.success === false) {
        pushToast({
          message: `肉身破限失败，保底进度 ${Math.floor(nextResult.guaranteeProgress ?? 0)}%`,
          tone: 'warning',
        });
        return;
      }

      setCelebrationTick((tick) => tick + 1);
    } catch (caught) {
      pushToast({
        message: caught instanceof Error ? caught.message : '肉身破限失败',
        tone: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading && !cultivator) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="loading-tip">正在读取肉身状态……</p>
      </div>
    );
  }

  if (!cultivator || !preview) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <InkNotice>
          尚无角色资料，先创建角色后再准备肉身破限。
          <InkButton href="/game/create" variant="primary" className="ml-2">
            觉醒灵根
          </InkButton>
        </InkNotice>
      </div>
    );
  }

  if (!preview.nextRealm || !preview.canAttempt) {
    return (
      <GameSceneFrame
        title="肉身破限"
        description="肉身破限只在五轨根基与修为境界都满足后开启。"
      >
        <GameSceneSection title="破限未成">
          <div className="space-y-3">
            <InkNotice>
              {!preview.nextRealm
                ? '肉身已至当前最高阶位。'
                : '当前肉身根基尚未满足破限条件。'}
            </InkNotice>
            {preview.requirements.length > 0 ? (
              <div className="text-ink-secondary flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5">
                {preview.requirements.map((requirement) => (
                  <span
                    key={requirement.label}
                    className={requirement.met ? 'text-wood' : undefined}
                  >
                    {requirement.met ? '✓' : '·'} {requirement.label}
                  </span>
                ))}
              </div>
            ) : null}
            <InkButton href="/game/body-cultivation" variant="primary">
              返回炼体详情
            </InkButton>
          </div>
        </GameSceneSection>
      </GameSceneFrame>
    );
  }

  return (
    <GameSceneFrame
      title="肉身破限"
      description={`破开当前肉身桎梏，尝试晋入${nextRealmLabel ?? '下一阶'}。`}
    >
      <div className="space-y-5">
        {result?.success ? (
          <InkNotice tone="info">
            恭喜，肉身已提升至
            {result.toRealm
              ? BODY_REALM_LABELS[
                  result.toRealm as keyof typeof BODY_REALM_LABELS
                ]
              : nextRealmLabel}
            。
          </InkNotice>
        ) : result?.success === false ? (
          <InkNotice tone="warning">
            本次破限未成，保底进度已推进至
            {Math.floor(result.guaranteeProgress ?? 0)}%。
          </InkNotice>
        ) : null}

        <GameSceneSection title="破限火候">
          <div className="border-ink/15 bg-bgpaper/75 border border-dashed px-3 py-3">
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div>
                <p className="text-ink-secondary text-xs leading-5">当前肉身</p>
                <p className="text-ink font-semibold">
                  {BODY_REALM_LABELS[preview.currentRealm]}
                </p>
              </div>
              <div>
                <p className="text-ink-secondary text-xs leading-5">目标阶位</p>
                <p className="text-ink font-semibold">{nextRealmLabel}</p>
              </div>
              <div>
                <p className="text-ink-secondary text-xs leading-5">成功率</p>
                <p className="text-ink font-semibold">
                  {formatChance(preview.successChance)}
                </p>
              </div>
              <div>
                <p className="text-ink-secondary text-xs leading-5">保底进度</p>
                <p className="text-ink font-semibold">
                  {preview.guaranteeProgress}%
                </p>
              </div>
            </div>
          </div>
        </GameSceneSection>

        <GameSceneSection title="所需资材">
          <div className="space-y-3">
            <CostRequirementList
              requirements={requirements}
              selections={selections}
            />
            <InkActionGroup>
              <InkButton
                type="button"
                variant="secondary"
                onClick={openSelection}
              >
                选取材料
              </InkButton>
              <InkButton
                type="button"
                variant="primary"
                disabled={
                  !allCostsMet || submitting || result?.success === true
                }
                onClick={submitBreakthrough}
              >
                {submitting ? '破限中' : '确认突破'}
              </InkButton>
              <InkButton href="/game/body-cultivation" variant="secondary">
                返回详情
              </InkButton>
            </InkActionGroup>
          </div>
        </GameSceneSection>
      </div>

      <SelectionModal
        isOpen={isSelectionOpen}
        eligible={eligible}
        isLoading={eligibleLoading}
        error={eligibleError}
        requirements={requirements}
        selections={selections}
        onClose={() => {
          eligibleControllerRef.current?.abort();
          setEligibleLoading(false);
          setIsSelectionOpen(false);
        }}
        onRetry={() => void loadEligible()}
        onPageChange={handleEligiblePageChange}
        onSelectionChange={handleSelectionChange}
      />

      {celebrationTick > 0 && result?.success !== false ? (
        <InkIdentifyCelebration
          key={celebrationTick}
          variant="basic"
          onComplete={() => navigate('/game/body-cultivation')}
        />
      ) : null}
    </GameSceneFrame>
  );
}
