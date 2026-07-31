import {
  NOVICE_DUNGEON_RESOURCE_THRESHOLD,
  type NoviceReadinessResource,
} from '@shared/lib/noviceGuidance';
import type { TaskInstance } from '@shared/types/task';
import { findNextTutorialTask } from './taskClient';

export interface NoviceHomeAction {
  title: string;
  summary: string;
  href: string;
  label: string;
}

export interface NoviceHomeActionInput {
  tasks: TaskInstance[];
  hp?: NoviceReadinessResource | null;
  mp?: NoviceReadinessResource | null;
}

function percent(resource?: NoviceReadinessResource | null): number {
  if (!resource) return 100;
  const max = Math.max(1, Math.floor(resource.max));
  const current = Math.max(0, Math.min(max, Math.floor(resource.current)));
  return Math.floor((current / max) * 100);
}

function hasLowDungeonResource(
  hp?: NoviceReadinessResource | null,
  mp?: NoviceReadinessResource | null,
) {
  return (
    percent(hp) < NOVICE_DUNGEON_RESOURCE_THRESHOLD ||
    percent(mp) < NOVICE_DUNGEON_RESOURCE_THRESHOLD
  );
}

function hasUnrecoveredResource(
  hp?: NoviceReadinessResource | null,
  mp?: NoviceReadinessResource | null,
) {
  return percent(hp) < 100 || percent(mp) < 100;
}

export function getNextNoviceHomeAction(
  input: NoviceHomeActionInput,
): NoviceHomeAction | null {
  const task = findNextTutorialTask(input.tasks);
  if (!task) return null;

  const rewardClaimedAt =
    task.snapshot.rewardClaimedAt ?? task.metadata.rewardClaimedAt;
  const canClaim = task.status === 'completed' && !rewardClaimedAt;

  if (canClaim) {
    if (
      task.definitionId === 'tutorial_first_dungeon' &&
      hasUnrecoveredResource(input.hp, input.mp)
    ) {
      return {
        title: '📜 战后调息',
        summary: '第一次探秘已结算，先把气血与法力恢复，再领取入门奖励。',
        href: '/game/inn',
        label: '调息',
      };
    }

    return {
      title: '📜 入门卷宗',
      summary: `${task.snapshot.title}已完成，先领取奖励。`,
      href: '/game/tasks',
      label: '领奖',
    };
  }

  if (task.definitionId === 'tutorial_starter_supply') {
    return {
      title: '📜 入门供给',
      summary: task.snapshot.summary,
      href: '/game/tasks',
      label: '领取',
    };
  }

  if (task.definitionId === 'tutorial_first_alchemy') {
    return {
      title: '📜 第一炉丹',
      summary: '去炼丹房使用推荐首炉，完成青露草与凝水花的入门炼制。',
      href: '/game/craft/alchemy',
      label: '开炉',
    };
  }

  if (task.definitionId === 'tutorial_first_dungeon') {
    if (hasLowDungeonResource(input.hp, input.mp)) {
      return {
        title: '📜 探秘准备',
        summary: '首次探秘前先把气血与法力恢复到八成以上。',
        href: '/game/inn',
        label: '调息',
      };
    }

    return {
      title: '📜 低危探秘',
      summary: '状态已备好，去低危秘境学会查探、撤退与结算。入门套装建议穿戴，但不强制。',
      href: '/game/dungeon',
      label: '探秘',
    };
  }

  return {
    title: '📜 入门卷宗',
    summary: task.snapshot.summary,
    href: '/game/tasks',
    label: '继续',
  };
}
