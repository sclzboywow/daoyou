import type { DbTransaction } from '@server/lib/drizzle/db';
import { playerCommandExecutor } from '@server/lib/services/CommandExecutors';
import type { ResourceChangeDescriptor } from '@shared/contracts/resources';
import type { SectRuntime } from '@shared/engine/sect';

export type SectCommandArgs = {
  userId: string;
  cultivatorId: string;
  source: string;
  idempotency: { key: string; fingerprint: string };
  runtime: SectRuntime;
};

export function executeSectPlayerCommand<TResult>(
  args: SectCommandArgs,
  command: (tx: DbTransaction) => Promise<{
    result: TResult;
    resourceChanges: ResourceChangeDescriptor[];
  }>,
) {
  return playerCommandExecutor.executeWithLock({
    userId: args.userId,
    cultivatorId: args.cultivatorId,
    source: args.source,
    idempotency: args.idempotency,
    command,
  });
}
