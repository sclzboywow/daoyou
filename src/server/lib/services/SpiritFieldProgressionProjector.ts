import type { DbTransaction } from '@server/lib/drizzle/db';
import {
  isDomainEventType,
  type DomainEventEnvelope,
} from '@shared/contracts/domainEvents';
import type { FeatureCommandResult } from './CommandExecutors';

/** 官方灵田表已去掉 proficiency；进度投影保留 no-op，避免旧消费者报错。 */
export async function projectSpiritFieldProgressionDomainEvent(
  event: DomainEventEnvelope,
  tx: DbTransaction,
): Promise<FeatureCommandResult<{ status: 'applied' | 'ignored'; gained?: number }>> {
  void tx;
  if (
    isDomainEventType(event, 'spirit-field.sown') ||
    isDomainEventType(event, 'spirit-field.care.performed') ||
    isDomainEventType(event, 'spirit-field.harvest.completed') ||
    isDomainEventType(event, 'spirit-field.upgraded')
  ) {
    return { result: { status: 'ignored' }, resourceChanges: [] };
  }
  return { result: { status: 'ignored' }, resourceChanges: [] };
}
