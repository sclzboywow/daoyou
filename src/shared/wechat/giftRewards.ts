import { QI_RESTORE_TALISMAN_SCENARIOS } from '../config/qiSystem';
import { ConsumableFactsSchema } from '../items/definitions/consumables';
import type { MailAttachment } from '../types/mail';

/** Published platform goods must survive retirement of the legacy item library. */
export function wechatGiftAttachment(
  id: string,
  quantity: number,
): MailAttachment | undefined {
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 1_000_000_000
  )
    throw new Error('Invalid gift quantity');
  if (id !== 'talisman_qi_restore_small') return undefined;
  const scenario = 'qi_restore_small';
  const { label, amount } = QI_RESTORE_TALISMAN_SCENARIOS[scenario];
  return {
    type: 'inventory_v1',
    name: label,
    quantity,
    inventory: {
      definitionId: 'consumable.v1',
      quantity,
      instanceData: ConsumableFactsSchema.parse({
        name: label,
        type: '符箓',
        quality: '灵品',
        score: 80,
        description: `使用后恢复 ${amount} 点天地灵气，受每日符箓使用次数和灵气溢出上限约束。`,
        spec: { kind: 'talisman', scenario, sessionMode: 'consume_on_action' },
      }),
    },
  };
}
