import type {
  BattlePlaybackRecordV3,
  PublicBattleUnitSnapshotV1,
} from '@shared/types/battle';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type PlaybackState = {
  record: BattlePlaybackRecordV3 | undefined;
  currentIndex: number;
  isPlaying: boolean;
};

export function resolvePlaybackStateForRecord(
  playbackState: PlaybackState,
  record: BattlePlaybackRecordV3 | undefined,
): PlaybackState {
  return playbackState.record === record
    ? playbackState
    : { record, currentIndex: -1, isPlaying: false };
}

/**
 * useCombatPlayer V3
 *
 * 职责：管理战斗播放状态，并提供平滑的状态快照映射。
 */
export function useCombatPlayer(record: BattlePlaybackRecordV3 | undefined) {
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    record,
    currentIndex: -1,
    isPlaying: false,
  });
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  const sequences = useMemo(() => record?.sequences ?? [], [record]);
  const totalActions = sequences.length;
  const currentRecordState = resolvePlaybackStateForRecord(
    playbackState,
    record,
  );
  const currentIndex = currentRecordState.currentIndex;
  const isEnded = currentIndex >= totalActions - 1 && totalActions > 0;
  const isPlaying =
    currentRecordState.isPlaying && totalActions > 0 && !isEnded;

  const latestUnitsBySequenceId = useMemo(() => {
    const map = new Map<string, Record<string, PublicBattleUnitSnapshotV1>>();
    for (const frame of record?.stateTimeline.frames ?? []) {
      if (frame.sourceSequenceId) {
        map.set(frame.sourceSequenceId, frame.units);
      }
    }
    return map;
  }, [record]);

  const unitSnapshots = useMemo<
    Record<string, PublicBattleUnitSnapshotV1>
  >(() => {
    const initialUnits = record?.stateTimeline.frames[0]?.units;
    if (!record || !initialUnits) {
      return {};
    }

    let snapshots = initialUnits;
    for (let i = 0; i <= currentIndex; i++) {
      const sequence = sequences[i];
      if (!sequence) {
        continue;
      }

      const latestUnits = latestUnitsBySequenceId.get(sequence.id);
      if (latestUnits) {
        snapshots = { ...snapshots, ...latestUnits };
      }
    }

    return snapshots;
  }, [currentIndex, latestUnitsBySequenceId, record, sequences]);

  const next = useCallback(() => {
    if (totalActions <= 0) {
      return;
    }

    setPlaybackState((prev) => {
      const baseState = resolvePlaybackStateForRecord(prev, record);
      return {
        record,
        currentIndex: Math.min(baseState.currentIndex + 1, totalActions - 1),
        isPlaying: baseState.isPlaying,
      };
    });
  }, [record, totalActions]);

  const pause = useCallback(() => {
    setPlaybackState((prev) => ({
      ...resolvePlaybackStateForRecord(prev, record),
      isPlaying: false,
    }));
  }, [record]);

  const play = useCallback(() => {
    if (totalActions <= 0) {
      return;
    }

    setPlaybackState((prev) => {
      const baseState = resolvePlaybackStateForRecord(prev, record);
      return {
        record,
        currentIndex:
          baseState.currentIndex >= totalActions - 1
            ? -1
            : baseState.currentIndex,
        isPlaying: true,
      };
    });
  }, [record, totalActions]);

  const reset = useCallback(() => {
    setPlaybackState({
      record,
      currentIndex: -1,
      isPlaying: false,
    });
  }, [record]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const delay = 1000 / playbackSpeed;
    const timer = setTimeout(next, delay);
    return () => clearTimeout(timer);
  }, [currentIndex, isPlaying, playbackSpeed, next]);

  return {
    currentIndex,
    isPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    play,
    pause,
    reset,
    unitSnapshots,
    totalActions,
    progress: totalActions > 0 ? ((currentIndex + 1) / totalActions) * 100 : 0,
  };
}
