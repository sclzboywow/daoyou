import type { SectCompiledAbility } from './compilation';
import type {
  SectDefinition,
  SectMethodEffectCategory,
  SectMethodGrowthCurve,
  SectMethodId,
} from './definitions';

export const SECT_METHOD_MAX_LEVEL = 180;

export function roundSectMethodGrowthValue(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function normalizeSectMethodLevel(rawLevel: number | undefined): number {
  if (rawLevel === undefined || !Number.isFinite(rawLevel)) return 0;
  return Math.max(0, Math.min(SECT_METHOD_MAX_LEVEL, Math.floor(rawLevel)));
}

export function resolveSectMethodCurve(
  curve: SectMethodGrowthCurve,
  rawLevel: number | undefined,
): number {
  const t = normalizeSectMethodLevel(rawLevel) / SECT_METHOD_MAX_LEVEL;
  const value =
    curve === 'early'
      ? 0.8 * t + 0.2 * t * t
      : curve === 'balanced'
        ? 0.5 * t + 0.5 * t * t
        : 0.2 * t + 0.8 * t * t;
  return roundSectMethodGrowthValue(value);
}

export interface SectMethodGrowthPolicy {
  scaleEffect(
    methodId: SectMethodId,
    category: SectMethodEffectCategory,
    value: number,
    rawLevel: number | undefined,
  ): number;
  growDuration(
    methodId: SectMethodId,
    duration: number,
    rawLevel: number | undefined,
  ): number;
  growCount(
    methodId: SectMethodId,
    baseCount: number,
    rawLevel: number | undefined,
  ): number;
  projectAbilities(
    definition: SectDefinition,
    abilities: Record<string, SectCompiledAbility>,
    methodLevels: Partial<Record<SectMethodId, number>>,
  ): Record<string, SectCompiledAbility>;
}
