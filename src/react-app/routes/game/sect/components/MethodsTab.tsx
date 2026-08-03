import { SectAbilityDetails } from '@app/components/feature/sect/SectAbilityDetails';
import type { getSectDefinition } from '@app/components/feature/sect/sectResources';
import { GameLoadingState } from '@app/components/game-shell/GameLoadingState';
import {
  InkButton,
  InkCard,
  InkDetailDrawer,
  InkNotice,
} from '@app/components/ui';
import {
  useCultivatorCurrency,
  useCultivatorProgress,
} from '@app/lib/resources/player';
import { attrLabel } from '@shared/engine/battle-v5/effects/affixText/attributes';
import {
  getSectMethodTrainingCost,
  isListedSectAbility,
  projectSectMethodGrowthPresentation,
  type CultivatorSectState,
  type SectHeartMethodDefinition,
} from '@shared/engine/sect';
import { resolveSectAbilities } from '@shared/engine/sect/content';
import type { RealmType } from '@shared/types/constants';
import { useState } from 'react';
import { sectJsonRequest, type SectAction } from './types';

export type SectProgressionWorkspaceData = {
  definition: ReturnType<typeof getSectDefinition>;
  sect: CultivatorSectState;
  methodLevelCap: number;
};

function percent(value: number): string {
  return `${Number((value * 100).toFixed(2))}%`;
}

function describePanel(
  method: SectHeartMethodDefinition,
  value: number | undefined,
): string | undefined {
  const panel = method.growthProfile.panelModifier;
  if (!panel || value === undefined) return undefined;
  return `${attrLabel(panel.attrType)} +${percent(value)}`;
}

function getMethodDisabledReason(args: {
  method: SectHeartMethodDefinition;
  currentLevel: number;
  data: SectProgressionWorkspaceData;
  spiritStones: number;
  cultivationExp: number;
  cost: {
    cultivationExp: number;
    comprehensionInsight: number;
    spiritStones: number;
  };
}) {
  const targetLevel = args.currentLevel + 1;
  if (targetLevel > args.data.methodLevelCap) return '已达当前心法上限';
  const primary = args.data.definition?.methods.find(
    (method) => method.isPrimary,
  );
  if (
    primary &&
    args.method.id !== primary.id &&
    targetLevel > (args.data.sect?.methods[primary.id] ?? 0)
  ) {
    return `分卷不可超过${primary.name}`;
  }
  if (args.cultivationExp < args.cost.cultivationExp) return '修为不足';
  if (args.spiritStones < args.cost.spiritStones) return '灵石不足';
  return undefined;
}

export function MethodsTab({
  data,
  busy,
  action,
  realm,
}: {
  data: SectProgressionWorkspaceData;
  busy: boolean;
  action: SectAction;
  realm: RealmType;
}) {
  const currencyQuery = useCultivatorCurrency();
  const progressQuery = useCultivatorProgress();
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  if (!data.sect || !data.definition)
    return <InkNotice>拜师后方可研习宗门心法。</InkNotice>;
  if (!currencyQuery.data || !progressQuery.data) {
    const error = currencyQuery.error ?? progressQuery.error;
    return error ? (
      <InkNotice>{error}</InkNotice>
    ) : (
      <GameLoadingState message="正在读取修炼资源……" variant="inline" />
    );
  }
  const sect = data.sect;
  const definition = data.definition;
  const spiritStones = currencyQuery.data.spiritStones;
  const cultivationExp = Number(progressQuery.data.cultivation_exp);
  const selectedMethod = selectedMethodId
    ? definition.methods.find((method) => method.id === selectedMethodId)
    : undefined;
  const selectedLevel = selectedMethod
    ? (sect.methods[selectedMethod.id] ?? 0)
    : 0;
  const selectedGrowth = selectedMethod
    ? projectSectMethodGrowthPresentation(selectedMethod, selectedLevel)
    : undefined;
  const selectedTarget = selectedGrowth?.next?.snapshot.level;
  const selectedCost =
    selectedTarget !== undefined
      ? getSectMethodTrainingCost(selectedLevel, selectedTarget)
      : undefined;
  const selectedDisabledReason =
    selectedMethod && selectedCost
      ? getMethodDisabledReason({
          method: selectedMethod,
          currentLevel: selectedLevel,
          data,
          spiritStones,
          cultivationExp,
          cost: selectedCost,
        })
      : undefined;
  const resolvedAbilities = resolveSectAbilities({ sect, realm });
  const selectedAbilities = selectedMethod
    ? definition.abilities
        .filter(
          (ability) =>
            isListedSectAbility(ability) &&
            ability.unlock.type === 'method' &&
            ability.unlock.methodId === selectedMethod.id,
        )
        .sort((left, right) =>
          left.unlock.type === 'method' && right.unlock.type === 'method'
            ? left.unlock.level - right.unlock.level
            : 0,
        )
        .map((ability) =>
          resolvedAbilities.find((resolved) => resolved.id === ability.id)!,
        )
    : [];
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {[...definition.methods]
          .sort((left, right) => left.slot - right.slot)
          .map((method) => {
            const level = sect.methods[method.id] ?? 0;
            return (
              <InkCard key={method.id} padding="none">
                <button
                  type="button"
                  className="hover:bg-ink/4 w-full p-3 text-left transition-colors"
                  onClick={() => setSelectedMethodId(method.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <strong>{method.name}</strong>
                    <span className="text-crimson shrink-0 text-sm">
                      {level} / {data.methodLevelCap}级
                    </span>
                  </div>
                  <p className="text-ink-secondary mt-2 text-sm leading-6">
                    {method.description}
                  </p>
                </button>
              </InkCard>
            );
          })}
      </div>

      <InkDetailDrawer
        isOpen={Boolean(selectedMethod)}
        onClose={() => setSelectedMethodId(null)}
        title={selectedMethod?.name ?? '心法详情'}
        footer={
          selectedMethod && selectedGrowth ? (
            selectedGrowth.isMaxLevel ? (
              <div className="text-sm leading-6">
                <p className="font-medium">已达满级</p>
                <p className="text-ink-secondary">180级心法收益已全部生效。</p>
              </div>
            ) : selectedCost && selectedTarget !== undefined ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm leading-6">
                  <p>
                    本次：{selectedCost.cultivationExp}修为 ·{' '}
                    {selectedCost.spiritStones}灵石
                  </p>
                  <p className="text-ink-secondary">
                    持有：{cultivationExp}修为 · {spiritStones}灵石
                  </p>
                  {selectedDisabledReason ? (
                    <p className="text-crimson">{selectedDisabledReason}</p>
                  ) : null}
                </div>
                <InkButton
                  variant="primary"
                  disabled={Boolean(selectedDisabledReason)}
                  pending={busy}
                  pendingLabel="研习中……"
                  onClick={() =>
                    void action(
                      `/api/sects/current/methods/${selectedMethod.id}/train`,
                      sectJsonRequest('POST', { targetLevel: selectedTarget }),
                    )
                  }
                >
                  研习一级
                </InkButton>
              </div>
            ) : null
          ) : undefined
        }
      >
        {selectedMethod && selectedGrowth ? (
          <div className="space-y-4">
            <section>
              <p className="text-sm leading-7">{selectedMethod.description}</p>
              <div className="bg-ink/5 mt-3 p-3 text-sm leading-6">
                <p>
                  当前等级：{selectedLevel} / {data.methodLevelCap}级
                </p>
              </div>
            </section>

            {selectedMethod.growthProfile.panelModifier ? (
              <section>
                <h3 className="mb-2 text-base font-semibold">心法加成</h3>
                <dl className="grid gap-3 text-sm leading-6">
                  <div>
                    <dt className="text-ink-secondary">当前加成</dt>
                    {selectedGrowth.current.panelValue !== undefined ? (
                      <dd>
                        {describePanel(
                          selectedMethod,
                          selectedGrowth.current.panelValue,
                        )}
                      </dd>
                    ) : null}
                  </div>
                  {selectedGrowth.next ? (
                    <div>
                      <dt className="text-ink-secondary">
                        研习至{selectedGrowth.next.snapshot.level}级可获得
                      </dt>
                      {selectedGrowth.next.delta.panelValue !== undefined ? (
                        <dd className="text-crimson text-xs">
                          {describePanel(
                            selectedMethod,
                            selectedGrowth.next.delta.panelValue,
                          )}
                        </dd>
                      ) : null}
                    </div>
                  ) : null}
                </dl>
              </section>
            ) : null}

            <section>
              <h3 className="mb-2 text-base font-semibold">可悟神通</h3>
              <div className="space-y-3">
                {selectedAbilities.map((ability) => (
                  <div
                    key={ability.id}
                    className="border-ink/15 border-b border-dashed pb-3 text-sm leading-6 last:border-b-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-base">《{ability.name}》</strong>
                      <span
                        className={
                          ability.unlocked
                            ? 'text-crimson text-xs'
                            : 'text-ink-secondary text-xs'
                        }
                      >
                        {ability.unlocked ? '已解锁' : '尚未解锁'}
                      </span>
                    </div>
                    <p className="text-ink-secondary mt-1">{ability.summary}</p>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-xs leading-5">
                      <dt className="text-ink-secondary">解锁条件</dt>
                      <dd>{ability.unlockRequirements.join('、')}</dd>
                    </dl>
                    <SectAbilityDetails detail={ability} />
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </InkDetailDrawer>
    </>
  );
}
