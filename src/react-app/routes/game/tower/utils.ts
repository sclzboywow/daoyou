import { resolveTowerFloorKind } from '@shared/lib/tower';
import type { TowerEncounter } from '@shared/lib/tower';

export function formatSeasonReset(nextResetAt: string) {
  const date = new Date(nextResetAt);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatDepthLabel(floor: number) {
  return `第 ${floor} 层`;
}

export function describeFloorPressure(floor: number) {
  const kind = resolveTowerFloorKind(floor);
  if (kind === 'boss') return '主影';
  if (kind === 'elite') return '异化幻影';
  return '寻常幻影';
}

export function describeEncounterLabel(kind: TowerEncounter['kind']) {
  if (kind === 'boss') return '压阵主影';
  if (kind === 'elite') return '异化幻影';
  return '寻常幻影';
}
