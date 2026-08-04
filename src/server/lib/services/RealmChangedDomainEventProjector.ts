import { removeFromAllRankingRealmsExcept } from '@server/lib/redis/rankings';
import type { DomainEventEnvelope } from '@shared/contracts/domainEvents';
import type { FeatureCommandResult } from './CommandExecutors';

export async function projectRealmChangedRanking(
  event: DomainEventEnvelope<'cultivator.realm.changed'>,
): Promise<FeatureCommandResult<{ status: 'ignored' | 'applied' }>> {
  if (!event.data.major) {
    return { result: { status: 'ignored' as const }, resourceChanges: [] };
  }
  await removeFromAllRankingRealmsExcept(
    event.data.cultivatorId,
    event.data.toRealm,
  );
  return { result: { status: 'applied' as const }, resourceChanges: [] };
}
