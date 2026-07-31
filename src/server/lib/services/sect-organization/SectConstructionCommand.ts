import { publishLocalTransactionMessage } from '@server/lib/mq/localTransactionMessagePublisher';
import {
  releaseSectConstructionDaily,
  reserveSectConstructionDaily,
  type SectConstructionDailyRecord,
} from '@server/lib/redis/sectConstructionDaily';
import { quoteSectConstructionDonation } from '@shared/engine/sect';
import { sectOrganizationFacade } from '.';
import { SectError } from '../SectError';
import {
  executeSectPlayerCommand,
  type SectCommandArgs,
} from './commandSupport';
import { createPostgresSectConstructionCommandContext } from './PostgresSectOrganizationAdapters';
import { getSectDateKey } from './SectOrganizationClock';

export async function executeSectConstructionDonationCommand(
  args: SectCommandArgs & {
    facilityKey: string;
    spiritStones: number;
  },
) {
  const quote = quoteSectConstructionDonation(args.spiritStones);
  const dateKey = getSectDateKey();
  const record: SectConstructionDailyRecord = {
    requestId: args.idempotency.key,
    facilityKey: args.facilityKey,
    spiritStones: quote.spiritStones,
    constructionPoints: quote.constructionPoints,
    contribution: quote.contribution,
  };
  const reservation = await reserveSectConstructionDaily(
    args.userId,
    dateKey,
    record,
  );
  if (reservation === 'conflict')
    throw new SectError(
      'SECT_ORGANIZATION_INVALID',
      '今日已经完成过一次设施建设',
      409,
    );

  let committed;
  try {
    committed = await executeSectPlayerCommand(args, (tx) =>
      sectOrganizationFacade.construction.donate(
        args.cultivatorId,
        {
          facilityKey: args.facilityKey,
          spiritStones: quote.spiritStones,
          referenceId: args.idempotency.key,
          dailyStatus: {
            dateKey,
            constructedToday: true,
            facilityKey: args.facilityKey,
            spiritStones: quote.spiritStones,
            constructionPoints: quote.constructionPoints,
            contribution: quote.contribution,
          },
        },
        createPostgresSectConstructionCommandContext({
          q: tx,
          runtime: args.runtime,
        }),
      ),
    );
  } catch (error) {
    if (reservation === 'created') {
      try {
        await releaseSectConstructionDaily(args.userId, dateKey, record);
      } catch (releaseError) {
        console.error(
          '[sect-construction] failed to release daily reservation',
          {
            userId: args.userId,
            dateKey,
            releaseError,
          },
        );
      }
    }
    throw error;
  }

  void publishLocalTransactionMessage(committed.result.messageId).catch(
    (error) => {
      console.error('[sect-construction] failed to publish durable message', {
        messageId: committed.result.messageId,
        error,
      });
    },
  );
  return committed;
}
