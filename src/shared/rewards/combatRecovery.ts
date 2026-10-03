import type { CombatV6ReplayTimeline } from '../contracts/combatV6Replay';
import type { BattleEvent, BattleState } from '../engine/combat-v6/core';

export const COMBAT_RECOVERY_MARK = 'rewarded-ad-recovery:';
export type RecoverySnapshot = {
  playerId: string;
  state: BattleState;
  events: BattleEvent[];
  timeline: CombatV6ReplayTimeline;
};
export function canRecoverCombat(snapshot: RecoverySnapshot) {
  const unit = snapshot.state.units.find((u) => u.id === snapshot.playerId);
  return (
    !!unit &&
    !snapshot.state.result &&
    snapshot.state.phase === 'command' &&
    !unit.flags.downed &&
    !unit.flags.dead &&
    !unit.flags.escaped &&
    unit.attrs.hp > 0 &&
    unit.attrs.maxHp > 0 &&
    unit.attrs.hp <= unit.attrs.maxHp * 0.2 &&
    !unit.marks.some((mark) => mark.startsWith(COMBAT_RECOVERY_MARK))
  );
}

/** The receipt travels with the snapshot, so retries cannot heal a second time. */
export function recoverCombat(snapshot: RecoverySnapshot, ticketId: string) {
  const unit = snapshot.state.units.find((u) => u.id === snapshot.playerId);
  if (!unit) throw new Error('战斗角色不存在');
  if (unit.marks.includes(COMBAT_RECOVERY_MARK + ticketId)) return false;
  if (!canRecoverCombat(snapshot)) throw new Error('当前战斗不符合恢复条件');
  const hp = Math.max(unit.attrs.hp, Math.ceil(unit.attrs.maxHp / 2));
  const mp = Math.max(unit.attrs.mp, Math.ceil(unit.attrs.maxMp / 2));
  snapshot.events.push({
    type: 'heal',
    sourceId: unit.id,
    targetId: unit.id,
    amount: hp - unit.attrs.hp,
    hpAfter: hp,
  });
  snapshot.events.push({
    type: 'mpRestore',
    unitId: unit.id,
    amount: mp - unit.attrs.mp,
    mpAfter: mp,
  });
  unit.attrs.hp = hp;
  unit.attrs.mp = mp;
  unit.marks.push(COMBAT_RECOVERY_MARK + ticketId);
  snapshot.timeline.frames.push({
    afterEventSeq: snapshot.events.length - 1,
    round: snapshot.state.round,
    updates: [{ id: unit.id, set: { hp, mp } }],
  });
  return true;
}
