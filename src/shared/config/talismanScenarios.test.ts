import { describe, expect, it } from 'vitest';

import {
  TALISMAN_SCENARIO_OPTIONS,
  isTalismanScenario,
} from './talismanScenarios';

describe('talisman scenarios', () => {
  it('provides unique keywords with labels', () => {
    const values = TALISMAN_SCENARIO_OPTIONS.map((option) => option.value);

    expect(new Set(values).size).toBe(values.length);
    expect(
      TALISMAN_SCENARIO_OPTIONS.every(
        (option) => option.value.length > 0 && option.label.length > 0,
      ),
    ).toBe(true);
  });

  it('recognizes only configured keywords', () => {
    for (const option of TALISMAN_SCENARIO_OPTIONS) {
      expect(isTalismanScenario(option.value)).toBe(true);
    }

    expect(isTalismanScenario('custom_scenario')).toBe(false);
    expect(isTalismanScenario('')).toBe(false);
  });
});
