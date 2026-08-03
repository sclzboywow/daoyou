import type { SectMethodId, SectProjectionContext } from '../../../core';

function level(
  context: SectProjectionContext,
  methodId: SectMethodId,
): number | undefined {
  return context.sect.methods[methodId];
}

export function growthMagnitude(
  context: SectProjectionContext,
  methodId: SectMethodId,
  baseValue: number,
): number {
  return context.methodGrowth.scaleEffect(
    methodId,
    'damage',
    baseValue,
    level(context, methodId),
  );
}

export function growthHealMagnitude(
  context: SectProjectionContext,
  methodId: SectMethodId,
  baseValue: number,
): number {
  return context.methodGrowth.scaleEffect(
    methodId,
    'heal',
    baseValue,
    level(context, methodId),
  );
}

export function growthShieldMagnitude(
  context: SectProjectionContext,
  methodId: SectMethodId,
  baseValue: number,
): number {
  return context.methodGrowth.scaleEffect(
    methodId,
    'shield',
    baseValue,
    level(context, methodId),
  );
}

export function growthStatusMagnitude(
  context: SectProjectionContext,
  methodId: SectMethodId,
  baseValue: number,
): number {
  return context.methodGrowth.scaleEffect(
    methodId,
    'status',
    baseValue,
    level(context, methodId),
  );
}

export function growthDuration(
  context: SectProjectionContext,
  methodId: SectMethodId,
  baseDuration: number,
): number {
  return context.methodGrowth.growDuration(
    methodId,
    baseDuration,
    level(context, methodId),
  );
}

export function nodePercent(value: number): string {
  return `${Number((value * 100).toFixed(2))}%`;
}
