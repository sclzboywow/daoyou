import { describe, expect, it } from 'vitest';
import { AttributeSet } from '../../units/AttributeSet';
import { AttributeType, ModifierType } from '../../core/types';

describe('AttributeSet derived combat attributes', () => {
  it('derives accuracy from wisdom, willpower and speed', () => {
    const attributes = new AttributeSet({
      [AttributeType.WISDOM]: 100,
      [AttributeType.WILLPOWER]: 40,
      [AttributeType.SPEED]: 20,
    });

    expect(attributes.getBaseValue(AttributeType.ACCURACY)).toBeCloseTo(
      0.102332,
      6,
    );
    expect(attributes.getValue(AttributeType.ACCURACY)).toBeCloseTo(
      0.102332,
      6,
    );
  });

  it('keeps derived accuracy on a diminishing-return curve', () => {
    const attributes = new AttributeSet({
      [AttributeType.WISDOM]: 3000,
      [AttributeType.WILLPOWER]: 3000,
      [AttributeType.SPEED]: 3000,
    });

    expect(attributes.getBaseValue(AttributeType.ACCURACY)).toBeCloseTo(
      0.30087,
      6,
    );
  });

  it('derives evasion from speed with diminishing returns', () => {
    const attributes = new AttributeSet({
      [AttributeType.SPEED]: 1000,
    });
    const cappedAttributes = new AttributeSet({
      [AttributeType.SPEED]: 3000,
    });

    expect(attributes.getBaseValue(AttributeType.EVASION_RATE)).toBeCloseTo(
      0.229677,
      6,
    );
    expect(cappedAttributes.getBaseValue(AttributeType.EVASION_RATE)).toBeCloseTo(
      0.260741,
      6,
    );
  });

  it('keeps modifier support on derived accuracy and evasion', () => {
    const attributes = new AttributeSet({
      [AttributeType.WISDOM]: 1000,
      [AttributeType.WILLPOWER]: 1000,
      [AttributeType.SPEED]: 1000,
    });

    attributes.addModifier({
      id: 'accuracy_bonus',
      attrType: AttributeType.ACCURACY,
      type: ModifierType.FIXED,
      value: 0.05,
      source: 'test',
    });
    attributes.addModifier({
      id: 'evasion_bonus',
      attrType: AttributeType.EVASION_RATE,
      type: ModifierType.FIXED,
      value: 0.04,
      source: 'test',
    });

    expect(attributes.getValue(AttributeType.ACCURACY)).toBeCloseTo(
      0.319508,
      6,
    );
    expect(attributes.getValue(AttributeType.EVASION_RATE)).toBeCloseTo(
      0.269677,
      6,
    );
  });

  it('derives critical rate only from wisdom', () => {
    const agile = new AttributeSet({
      [AttributeType.SPEED]: 1000,
      [AttributeType.WISDOM]: 100,
    });
    const slow = new AttributeSet({
      [AttributeType.SPEED]: 10,
      [AttributeType.WISDOM]: 100,
    });

    expect(agile.getBaseValue(AttributeType.CRIT_RATE)).toBeCloseTo(
      slow.getBaseValue(AttributeType.CRIT_RATE),
      8,
    );
    expect(agile.getBaseValue(AttributeType.CRIT_RATE)).toBeCloseTo(
      0.134918,
      6,
    );
  });

  it('derives action speed from speed and willpower with modifier support', () => {
    const attributes = new AttributeSet({
      [AttributeType.SPEED]: 100,
      [AttributeType.WILLPOWER]: 50,
    });

    expect(attributes.getBaseValue(AttributeType.ACTION_SPEED)).toBe(90);

    attributes.addModifier({
      id: 'haste',
      attrType: AttributeType.ACTION_SPEED,
      type: ModifierType.ADD,
      value: 0.2,
      source: 'test',
    });

    expect(attributes.getValue(AttributeType.ACTION_SPEED)).toBe(108);
  });

  it('derives fixed combat attributes linearly from primary attributes', () => {
    const attributes = new AttributeSet({
      [AttributeType.VITALITY]: 100,
      [AttributeType.SPEED]: 50,
      [AttributeType.SPIRIT]: 100,
      [AttributeType.WILLPOWER]: 50,
    });

    expect(attributes.getBaseValue(AttributeType.ATK)).toBe(408);
    expect(attributes.getBaseValue(AttributeType.DEF)).toBe(191);
    expect(attributes.getBaseValue(AttributeType.MAGIC_ATK)).toBe(408);
    expect(attributes.getBaseValue(AttributeType.MAGIC_DEF)).toBe(98);
    expect(attributes.getBaseValue(AttributeType.ACTION_SPEED)).toBe(50);
    expect(attributes.getBaseValue(AttributeType.MAX_HP)).toBe(1960);
    expect(attributes.getBaseValue(AttributeType.MAX_MP)).toBe(1550);
  });
});
