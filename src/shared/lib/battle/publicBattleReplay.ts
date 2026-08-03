import type {
  UnitStateDelta,
  UnitStateSnapshot,
} from '@shared/engine/battle-v5/systems/state/types';
import type { BattleRecordV3 } from '@shared/engine/battle-v5/v3';
import type {
  PublicBattleReplayV1,
  PublicBattleUnitDeltaV1,
  PublicBattleUnitSnapshotV1,
} from '@shared/types/battle';

function mapValues<TInput, TOutput>(
  values: Record<string, TInput>,
  project: (value: TInput) => TOutput,
): Record<string, TOutput> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, project(value)]),
  );
}

function projectSnapshot(
  snapshot: UnitStateSnapshot,
): PublicBattleUnitSnapshotV1 {
  const publicSnapshot: Partial<UnitStateSnapshot> = { ...snapshot };
  delete publicSnapshot.attrs;
  delete publicSnapshot.baseAttrs;
  return publicSnapshot as PublicBattleUnitSnapshotV1;
}

function projectDelta(delta: UnitStateDelta): PublicBattleUnitDeltaV1 {
  const publicDelta: Partial<UnitStateDelta> = { ...delta };
  delete publicDelta.attrs;
  delete publicDelta.baseAttrs;
  return publicDelta as PublicBattleUnitDeltaV1;
}

export function toPublicBattleReplayV1(
  record: BattleRecordV3,
): PublicBattleReplayV1 {
  return {
    participants: record.participants,
    outcome: record.outcome,
    sequences: record.sequences,
    stateTimeline: {
      unitIds: record.stateTimeline.unitIds,
      unitNames: record.stateTimeline.unitNames,
      frames: record.stateTimeline.frames.map((frame) => ({
        ...frame,
        units: mapValues(frame.units, projectSnapshot),
        ...(frame.deltas
          ? { deltas: mapValues(frame.deltas, projectDelta) }
          : {}),
      })),
    },
    finalSnapshots: {
      winner: projectSnapshot(record.finalSnapshots.winner),
      loser: projectSnapshot(record.finalSnapshots.loser),
    },
  };
}
