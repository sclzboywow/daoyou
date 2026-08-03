import {
  normalizeSectMethodLevel,
  resolveSectMethodCurve,
  roundSectMethodGrowthValue,
  SECT_METHOD_MAX_LEVEL,
  type SectHeartMethodDefinition,
  type SectMethodEffectCategory,
  type SectMethodGrowthCurve,
} from '../domain';

const EFFECT_CATEGORIES = [
  'damage',
  'heal',
  'shield',
  'status',
] as const satisfies readonly SectMethodEffectCategory[];

export type SectMethodEffectGrowthValues = Record<
  SectMethodEffectCategory,
  number
>;

export interface SectMethodGrowthSnapshot {
  level: number;
  progress: number;
  panelValue?: number;
  effects: SectMethodEffectGrowthValues;
}

export interface SectMethodGrowthPresentationProjection {
  curve: SectMethodGrowthCurve;
  isMaxLevel: boolean;
  current: SectMethodGrowthSnapshot;
  next: {
    snapshot: SectMethodGrowthSnapshot;
    delta: {
      panelValue?: number;
      effects: SectMethodEffectGrowthValues;
    };
  } | null;
  maximum: SectMethodGrowthSnapshot;
}

export function projectSectMethodGrowthSnapshot(
  method: SectHeartMethodDefinition,
  rawLevel: number,
): SectMethodGrowthSnapshot {
  const level = normalizeSectMethodLevel(rawLevel);
  const progress = resolveSectMethodCurve(method.growthProfile.curve, level);
  const panel = method.growthProfile.panelModifier;
  return {
    level,
    progress,
    panelValue: panel
      ? roundSectMethodGrowthValue(panel.maxValue * progress)
      : undefined,
    effects: Object.fromEntries(
      EFFECT_CATEGORIES.map((category) => [
        category,
        roundSectMethodGrowthValue(
          method.growthProfile.effects[category] * progress,
        ),
      ]),
    ) as SectMethodEffectGrowthValues,
  };
}

function subtractEffectValues(
  next: SectMethodEffectGrowthValues,
  current: SectMethodEffectGrowthValues,
): SectMethodEffectGrowthValues {
  return Object.fromEntries(
    EFFECT_CATEGORIES.map((category) => [
      category,
      roundSectMethodGrowthValue(next[category] - current[category]),
    ]),
  ) as SectMethodEffectGrowthValues;
}

/** 为心法详情提供与运行时相同舍入语义的当前、下一级和满级投影。 */
export function projectSectMethodGrowthPresentation(
  method: SectHeartMethodDefinition,
  rawLevel: number,
): SectMethodGrowthPresentationProjection {
  const current = projectSectMethodGrowthSnapshot(method, rawLevel);
  const maximum = projectSectMethodGrowthSnapshot(
    method,
    SECT_METHOD_MAX_LEVEL,
  );
  const nextSnapshot =
    current.level < SECT_METHOD_MAX_LEVEL
      ? projectSectMethodGrowthSnapshot(method, current.level + 1)
      : null;
  return {
    curve: method.growthProfile.curve,
    isMaxLevel: nextSnapshot === null,
    current,
    next: nextSnapshot
      ? {
          snapshot: nextSnapshot,
          delta: {
            panelValue:
              current.panelValue === undefined ||
              nextSnapshot.panelValue === undefined
                ? undefined
                : roundSectMethodGrowthValue(
                    nextSnapshot.panelValue - current.panelValue,
                  ),
            effects: subtractEffectValues(
              nextSnapshot.effects,
              current.effects,
            ),
          },
        }
      : null,
    maximum,
  };
}
