import { z } from 'zod';
import type { SectOrganizationPluginManifest } from '../SectOrganizationPlugins';
import type { SectTaskExecutor } from '../task-executors/SectTaskExecutor';

const fixtureInput = z.object({ pass: z.literal(true) });

const fixtureExecutor: SectTaskExecutor<z.infer<typeof fixtureInput>> = {
  key: 'fixture-sect.battle',
  inputSchema: (actionKey) =>
    actionKey === 'finish' ? fixtureInput : z.never(),
  requiredCapability: (definition) => definition.requiredCapability,
  actions: (definition) => [
    {
      key: 'finish',
      renderer: 'fixture-sect.action.battle',
      label: definition.presentation.actionLabel,
    },
  ],
  initializePayload: async (context) => context.payload,
  execute: async (_actionKey, _context, input) => ({
    completed: input.pass,
    completionSettlement: 'deferred',
    outcome: { renderer: 'fixture-sect.outcome', data: { pass: input.pass } },
  }),
};

export const FIXTURE_SECT_ORGANIZATION_PLUGIN: SectOrganizationPluginManifest =
  {
    sectId: 'fixture-sect',
    executors: [() => fixtureExecutor],
  };
