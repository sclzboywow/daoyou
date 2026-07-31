import type { SectSubmissionCandidatesData } from '@shared/contracts/sect';
import {
  matchSectDeliveryCandidate,
  type SectTaskDefinition,
} from '@shared/engine/sect';
import { SectError } from '../SectError';
import type { SectQueryContext } from './ports';

function invalid(message: string, status = 409): never {
  throw new SectError('SECT_ORGANIZATION_INVALID', message, status);
}

function periodKey(
  definition: SectTaskDefinition,
  context: SectQueryContext,
): string {
  if (definition.kind === 'daily') return context.clock.dateKey();
  if (definition.kind === 'weekly') return context.clock.weekKey();
  return 'permanent';
}

export class SectTaskSubmissionQueryService {
  async execute(
    input: {
      cultivatorId: string;
      taskId: string;
      page: number;
      pageSize: number;
      eligible: 'all' | 'yes' | 'no';
    },
    context: SectQueryContext,
  ): Promise<SectSubmissionCandidatesData> {
    const membership = await context.memberships.findByCultivator(
      input.cultivatorId,
    );
    if (!membership) invalid('尚未拜入宗门');
    const definition = context.modules
      .require(membership.sectId)
      .tasks.get(input.taskId);
    if (!definition) invalid('未知宗门委托', 400);
    const record = await context.tasks.find(
      membership.id,
      periodKey(definition, context),
      definition.id,
    );
    if (!record || record.status !== 'active')
      invalid('只有进行中的交付委托可以选择物品');
    const requirement = record.payload.offer.requirement;
    if (!requirement) invalid('该任务不是道具交付委托', 400);
    const page = await context.submissionInventory.listSubmissionItemsPage({
      cultivatorId: input.cultivatorId,
      kind: requirement.kind,
      page: input.page,
      pageSize: input.pageSize,
    });
    const matched = page.items
      .map((item) => ({
        item,
        ...matchSectDeliveryCandidate(requirement, item),
      }))
      .filter((candidate) =>
        input.eligible === 'all'
          ? true
          : candidate.eligible === (input.eligible === 'yes'),
      )
      .sort((left, right) => Number(right.eligible) - Number(left.eligible));
    return {
      requirement,
      items: matched,
      page: input.page,
      pageSize: input.pageSize,
      total: page.total,
    };
  }
}
