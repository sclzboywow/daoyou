import type { DbTransaction } from '@server/lib/drizzle/db';
import { sectOrganizationFacade } from '.';
import {
  executeSectPlayerCommand,
  type SectCommandArgs,
} from './commandSupport';

type TraditionCommandArgs = SectCommandArgs & {
  tradition: (
    tx: DbTransaction,
  ) => ReturnType<typeof sectOrganizationFacade.tradition>;
};

export function executeSectMethodTrainCommand(
  args: TraditionCommandArgs & { methodId: string; targetLevel: number },
) {
  return executeSectPlayerCommand(args, (tx) =>
    args.tradition(tx).trainMethodCommand({
      cultivatorId: args.cultivatorId,
      methodId: args.methodId,
      targetLevel: args.targetLevel,
    }),
  );
}

export function executeSectPathLayerUnlockCommand(
  args: TraditionCommandArgs & { pathId: string; layerId: string },
) {
  return executeSectPlayerCommand(args, (tx) =>
    args.tradition(tx).unlockPathLayerCommand({
      cultivatorId: args.cultivatorId,
      pathId: args.pathId,
      layerId: args.layerId,
    }),
  );
}

export function executeSectPathActivateCommand(
  args: TraditionCommandArgs & { pathId: string },
) {
  return executeSectPlayerCommand(args, (tx) =>
    args.tradition(tx).activatePathCommand(args.cultivatorId, args.pathId),
  );
}

export function executeSectMeridianUpdateCommand(
  args: TraditionCommandArgs & {
    pathId: string;
    slot: number;
    nodeIds: string[];
  },
) {
  return executeSectPlayerCommand(args, (tx) =>
    args
      .tradition(tx)
      .setMeridianLoadoutCommand(
        args.cultivatorId,
        args.pathId,
        args.slot,
        args.nodeIds,
      ),
  );
}

export function executeSectMeridianActivateCommand(
  args: TraditionCommandArgs & { pathId: string; slot: number },
) {
  return executeSectPlayerCommand(args, (tx) =>
    args
      .tradition(tx)
      .activateMeridianLoadoutCommand(
        args.cultivatorId,
        args.pathId,
        args.slot,
      ),
  );
}

export function executeSectAbilityLoadoutCommand(
  args: TraditionCommandArgs & { abilityIds: Array<string | null> },
) {
  return executeSectPlayerCommand(args, (tx) =>
    args
      .tradition(tx)
      .setAbilityLoadoutCommand(args.cultivatorId, args.abilityIds),
  );
}

export function executeSectPathTacticCommand(
  args: TraditionCommandArgs & { pathId: string; tacticId: string },
) {
  return executeSectPlayerCommand(args, (tx) =>
    args
      .tradition(tx)
      .setPathTacticCommand(
        args.cultivatorId,
        args.pathId,
        args.tacticId,
      ),
  );
}
