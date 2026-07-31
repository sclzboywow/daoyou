import { describe, expect, it } from 'vitest';
import { createAbilitySlots } from '..';

describe('宗门神通装配', () => {
  it('固定保留四个稀疏槽位', () => {
    expect(createAbilitySlots(['guiding-sword', null, 'turning-body'])).toEqual(
      ['guiding-sword', null, 'turning-body', null],
    );
  });
});
