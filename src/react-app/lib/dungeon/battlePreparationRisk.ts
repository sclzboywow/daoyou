import { REALM_ORDER } from '@shared/types/constants';
import type { Cultivator } from '@shared/types/cultivator';

export interface BattlePreparationRisk {
  shouldWarn: boolean;
  enemyRealmHigher: boolean;
  enemyAttributePressure: boolean;
  message: string | null;
}

type BattlePreparationParticipant = Pick<
  Cultivator,
  'realm' | 'attributes'
>;

function totalAttributes(cultivator: Pick<Cultivator, 'attributes'>): number {
  return Object.values(cultivator.attributes).reduce(
    (sum, value) => sum + value,
    0,
  );
}

export function evaluateBattlePreparationRisk(
  player: BattlePreparationParticipant,
  enemy: Cultivator | null,
): BattlePreparationRisk {
  if (!enemy) {
    return {
      shouldWarn: false,
      enemyRealmHigher: false,
      enemyAttributePressure: false,
      message: null,
    };
  }

  const enemyRealmHigher = REALM_ORDER[enemy.realm] > REALM_ORDER[player.realm];
  const enemyAttributePressure =
    totalAttributes(enemy) > Math.max(1, totalAttributes(player)) * 1.18;

  return {
    shouldWarn: enemyRealmHigher || enemyAttributePressure,
    enemyRealmHigher,
    enemyAttributePressure,
    message: enemyRealmHigher
      ? '对方境界高过你。第一次探秘建议直接撤退，撤退不会受伤。仍要开战吗？'
      : enemyAttributePressure
        ? '对方五维气机明显压过你。第一次探秘建议撤退，先调息、装备或炼丹后再来。仍要开战吗？'
        : null,
  };
}
