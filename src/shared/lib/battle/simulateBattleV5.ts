import { BattleEngineV5 } from '@shared/engine/battle-v5/BattleEngineV5';
import { EventBus } from '@shared/engine/battle-v5/core/EventBus';
import { createBattleUnitsWithInit } from '@shared/engine/battle-v5/setup/BattleInitApplier';
import {
  assertPreparedBattleContext,
  type PreparedBattleContext,
} from '@shared/engine/battle-v5/setup/BattleStateStrategy';
import type { BattleRecord } from '@shared/types/battle';
import {
  withBattleRandomSource,
  type BattleRandomSource,
} from '@shared/engine/battle-v5/core/BattleRandom';

export function simulateBattleV5(
  context: PreparedBattleContext,
  randomSource?: BattleRandomSource,
): BattleRecord {
  assertPreparedBattleContext(context);
  return withBattleRandomSource(randomSource, () => {
    EventBus.instance.reset();

    const { player, opponent, initConfig } = context;
    const { playerUnit, opponentUnit } = createBattleUnitsWithInit(
      player,
      opponent,
      initConfig,
    );

    const engine = new BattleEngineV5(playerUnit, opponentUnit);

    try {
      const battleResult = engine.execute();

      const winnerCultivator =
        battleResult.winner === playerUnit.id ? player : opponent;
      const loserCultivator =
        battleResult.winner === playerUnit.id ? opponent : player;

      return {
        winner: { id: winnerCultivator.id, name: winnerCultivator.name },
        loser: { id: loserCultivator.id, name: loserCultivator.name },
        logs: battleResult.logs,
        turns: battleResult.turns,
        player: player.id ?? playerUnit.id,
        opponent: opponent.id ?? opponentUnit.id,
        logSpans: battleResult.logSpans ?? [],
        stateTimeline: battleResult.stateTimeline,
        winnerSnapshot: battleResult.winnerSnapshot,
        loserSnapshot: battleResult.loserSnapshot,
      };
    } finally {
      engine.destroy();
      EventBus.instance.reset();
    }
  });
}
