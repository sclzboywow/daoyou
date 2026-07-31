import type { EnemyRace } from '@shared/types/constants';
import type { EnemySkillRole } from './types';

export interface EnemyCombatPolicy {
  roleOrderBySkillCount: Record<1 | 2 | 3 | 4, EnemySkillRole[]>;
  pressureRoles: EnemySkillRole[];
  minPressureBySkillCount: Record<1 | 2 | 3 | 4, number>;
  maxSelfTargetBySkillCount: Record<1 | 2 | 3 | 4, number>;
}

type RoleOrder = [EnemySkillRole, EnemySkillRole, EnemySkillRole, EnemySkillRole];

const PRESSURE_ROLES: EnemySkillRole[] = ['offense', 'control'];

function buildPolicy(order: RoleOrder): EnemyCombatPolicy {
  return {
    roleOrderBySkillCount: {
      1: order.slice(0, 1),
      2: order.slice(0, 2),
      3: order.slice(0, 3),
      4: order.slice(0, 4),
    },
    pressureRoles: PRESSURE_ROLES,
    minPressureBySkillCount: {
      1: 1,
      2: 2,
      3: 2,
      4: 2,
    },
    maxSelfTargetBySkillCount: {
      1: 0,
      2: 0,
      3: 1,
      4: 2,
    },
  };
}

export const ENEMY_COMBAT_POLICIES: Record<EnemyRace, EnemyCombatPolicy> = {
  人族: buildPolicy(['offense', 'control', 'guard', 'sustain']),
  妖族: buildPolicy(['offense', 'control', 'sustain', 'guard']),
  鬼魂: buildPolicy(['control', 'offense', 'sustain', 'guard']),
  魔族: buildPolicy(['offense', 'control', 'sustain', 'guard']),
  古兽: buildPolicy(['offense', 'control', 'guard', 'sustain']),
  灵族: buildPolicy(['offense', 'control', 'guard', 'sustain']),
};

export function getEnemyCombatPolicy(race: EnemyRace): EnemyCombatPolicy {
  return ENEMY_COMBAT_POLICIES[race];
}

export function isEnemyPressureRole(
  policy: EnemyCombatPolicy,
  role: EnemySkillRole,
): boolean {
  return policy.pressureRoles.includes(role);
}

export function validateEnemySkillRoles(
  policy: EnemyCombatPolicy,
  roles: readonly EnemySkillRole[],
): boolean {
  const skillCount = roles.length as 1 | 2 | 3 | 4;
  if (skillCount < 1 || skillCount > 4) {
    return false;
  }

  const pressureCount = roles.filter((role) =>
    isEnemyPressureRole(policy, role),
  ).length;
  const selfTargetCount = roles.length - pressureCount;

  return (
    pressureCount >= policy.minPressureBySkillCount[skillCount] &&
    selfTargetCount <= policy.maxSelfTargetBySkillCount[skillCount]
  );
}
