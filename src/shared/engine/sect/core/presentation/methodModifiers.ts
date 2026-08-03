import type {
  CultivatorSectState,
  SectDefinition,
  SectMethodModifierProjection,
} from '../domain';
import { projectSectMethodGrowthSnapshot } from './methodGrowthPresentation';

export function projectSectMethodModifiers(
  sect: CultivatorSectState | undefined,
  definition: SectDefinition,
): SectMethodModifierProjection[] {
  if (!sect || sect.status !== 'active' || sect.sectId !== definition.id)
    return [];
  return definition.methods.flatMap((method) => {
    const level = sect.methods[method.id] ?? 0;
    const panelModifier = method.growthProfile.panelModifier;
    if (!panelModifier || level <= 0) return [];
    const growth = projectSectMethodGrowthSnapshot(method, level);
    const panelValue = growth.panelValue;
    if (panelValue === undefined) return [];
    return [
      {
        methodId: method.id,
        methodName: method.name,
        level,
        modifiers: [
          {
            attrType: panelModifier.attrType,
            type: panelModifier.type,
            value: panelValue,
          },
        ],
      },
    ];
  });
}
