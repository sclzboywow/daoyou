import { describe, expect, it } from 'vitest';
import {
  SectAbilityLoadoutRequestSchema,
  SectMeridianLoadoutRequestSchema,
  SectSubmissionCandidatesQuerySchema,
  SectTaskSubmissionInputSchema,
} from './sect';

describe('SectAbilityLoadoutRequestSchema', () => {
  it('accepts exactly four nullable fixed slots', () => {
    expect(
      SectAbilityLoadoutRequestSchema.safeParse({
        abilityIds: ['guiding-sword', null, 'turning-body', null],
      }).success,
    ).toBe(true);
    expect(
      SectAbilityLoadoutRequestSchema.safeParse({
        abilityIds: ['guiding-sword'],
      }).success,
    ).toBe(false);
    expect(
      SectAbilityLoadoutRequestSchema.safeParse({
        abilityIds: ['guiding-sword', null, null, null, null],
      }).success,
    ).toBe(false);
  });
});

describe('SectSubmissionCandidatesQuerySchema', () => {
  it('bounds page size and eligible filters', () => {
    expect(
      SectSubmissionCandidatesQuerySchema.parse({
        page: '2',
        pageSize: '30',
        eligible: 'yes',
      }),
    ).toEqual({ page: 2, pageSize: 30, eligible: 'yes' });
    expect(
      SectSubmissionCandidatesQuerySchema.safeParse({
        page: 1,
        pageSize: 51,
      }).success,
    ).toBe(false);
    expect(
      SectSubmissionCandidatesQuerySchema.safeParse({
        page: 1,
        eligible: 'maybe',
      }).success,
    ).toBe(false);
  });
});

describe('SectTaskSubmissionInputSchema', () => {
  it('accepts only the canonical batch submission shape', () => {
    const itemId = '894471ab-93f1-4575-bbb8-3c89f28a2512';
    expect(
      SectTaskSubmissionInputSchema.parse({
        items: [{ itemId, quantity: 1 }],
      }),
    ).toEqual({ items: [{ itemId, quantity: 1 }] });
    expect(
      SectTaskSubmissionInputSchema.safeParse({
        itemId,
        quantity: 1,
      }).success,
    ).toBe(false);
    expect(
      SectTaskSubmissionInputSchema.safeParse({
        items: [
          { itemId, quantity: 1 },
          { itemId, quantity: 1 },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('SectMeridianLoadoutRequestSchema', () => {
  it('accepts paths with seven or more layers up to the transport limit', () => {
    expect(
      SectMeridianLoadoutRequestSchema.safeParse({
        nodeIds: Array.from({ length: 7 }, (_, index) => `node-${index + 1}`),
      }).success,
    ).toBe(true);
    expect(
      SectMeridianLoadoutRequestSchema.safeParse({
        nodeIds: Array.from({ length: 65 }, (_, index) => `node-${index + 1}`),
      }).success,
    ).toBe(false);
  });
});
