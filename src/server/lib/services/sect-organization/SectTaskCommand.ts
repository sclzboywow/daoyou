import { sectOrganizationFacade } from '.';
import { createPostgresSectCommandContext } from './PostgresSectOrganizationAdapters';
import {
  executeSectPlayerCommand,
  type SectCommandArgs,
} from './commandSupport';

export function executeSectTaskActionCommand(
  args: SectCommandArgs & {
    taskId: string;
    actionKey: string;
    requestId: string;
    input: Record<string, unknown>;
  },
) {
  return executeSectPlayerCommand(args, (tx) =>
    sectOrganizationFacade.tasks.actions.execute(
      {
        userId: args.userId,
        cultivatorId: args.cultivatorId,
        taskId: args.taskId,
        actionKey: args.actionKey,
        requestId: args.requestId,
        input: args.input,
      },
      createPostgresSectCommandContext({
        tx,
        runtime: args.runtime,
        userId: args.userId,
      }),
    ),
  );
}
