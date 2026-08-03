import { BattleEngineV5 } from '@shared/engine/battle-v5/BattleEngineV5';
import {
  withBattleRandomSource,
  type BattleRandomSource,
} from '@shared/engine/battle-v5/core/BattleRandom';
import { EventBus } from '@shared/engine/battle-v5/core/EventBus';
import { createBattleUnitsWithInit } from '@shared/engine/battle-v5/setup/BattleInitApplier';
import {
  assertPreparedBattleContext,
  type PreparedBattleContext,
} from '@shared/engine/battle-v5/setup/BattleStateStrategy';
import { validateBattleRecordV3 } from '@shared/engine/battle-v5/v3';
import type { BattleRecordV3 } from '@shared/types/battle';

export function simulateBattleV5(
  context: PreparedBattleContext,
  randomSource?: BattleRandomSource,
): BattleRecordV3 {
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

      const winnerUnit =
        battleResult.winner === playerUnit.id ? playerUnit : opponentUnit;
      const loserUnit = winnerUnit === playerUnit ? opponentUnit : playerUnit;

      const record: BattleRecordV3 = {
        participants: {
          player: { id: playerUnit.id, name: playerUnit.name },
          opponent: { id: opponentUnit.id, name: opponentUnit.name },
        },
        outcome: {
          winner: {
            id: winnerUnit.id,
            name: winnerUnit.name,
          },
          loser: {
            id: loserUnit.id,
            name: loserUnit.name,
          },
          turns: battleResult.turns,
        },
        sequences: battleResult.sequences,
        stateTimeline: battleResult.stateTimeline,
        finalSnapshots: {
          winner: battleResult.winnerSnapshot,
          loser: battleResult.loserSnapshot,
        },
      };
      validateBattleRecordV3(record);
      return record;
    } finally {
      engine.destroy();
      EventBus.instance.reset();
    }
  });
}
