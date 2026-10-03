/** Finished battles keep their receipt until the player returns to exploration.
 * Only the current protocol's terminal AND committed receipt releases occupancy.
 * Missing, legacy and unsettled payloads remain blocked for recovery.
 */
export function isSettledDungeonBattle(payload:unknown):boolean {
  if(!payload||typeof payload!=='object')return false;
  const battle=payload as {settled?:unknown;snapshot?:{version?:unknown;state?:{phase?:unknown}}};
  return battle.settled===true&&battle.snapshot?.version==='dungeon-v6-v1'&&battle.snapshot.state?.phase==='ended';
}
