import type { DbTransaction } from '@server/lib/drizzle/db';
import type { DomainEventEnvelope } from '@shared/contracts/domainEvents';
import { MaterialGenerator } from '@shared/engine/material/creation/MaterialGenerator';
import { YieldCalculator } from '@shared/engine/yield/YieldCalculator';
import { MailService, type MailAttachment } from './MailService';

export async function generateYieldRewardAttachments(
  event: DomainEventEnvelope<'yield.claimed'>,
): Promise<MailAttachment[]> {
  const materials = await MaterialGenerator.generateRandom(
    event.data.materialCount,
    {
      qualityChanceMap: YieldCalculator.getMaterialQualityChanceMap(
        event.data.realm,
      ),
    },
  );
  if (materials.length === 0) {
    throw new Error(`历练奖励未生成材料: ${event.id}`);
  }
  return materials.map((material) => ({
    type: 'material',
    name: material.name,
    quantity: material.quantity,
    data: material,
  }));
}

export async function projectYieldReward(
  event: DomainEventEnvelope<'yield.claimed'>,
  attachments: MailAttachment[],
  tx: DbTransaction,
) {
  await MailService.sendMail(
    event.data.cultivatorId,
    '历练机缘',
    '道友历练途中，偶得天材地宝，特以此传音玉简送达。',
    attachments,
    'reward',
    tx,
  );
  return {
    result: { status: 'created' as const },
    resourceChanges: [],
  };
}
