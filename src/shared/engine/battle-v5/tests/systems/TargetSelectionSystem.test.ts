import { AttributeType, ModifierType } from '../../core/types';
import { TargetSelectionSystem } from '../../systems/TargetSelectionSystem';
import { Unit } from '../../units/Unit';

function unit(id: string, speed: number, willpower: number): Unit {
  return new Unit(id, id, {
    [AttributeType.SPEED]: speed,
    [AttributeType.WILLPOWER]: willpower,
  });
}

describe('TargetSelectionSystem action speed filters', () => {
  it('selects fastest and slowest units by action speed', () => {
    const system = new TargetSelectionSystem();
    const caster = unit('caster', 10, 10);
    const agile = unit('agile', 20, 10);
    const perceptive = unit('perceptive', 10, 100);
    const units = [caster, agile, perceptive];

    expect(system.selectTargets(
      caster,
      { team: 'any', scope: 'single', filters: ['fastest'], maxTargets: 1 },
      units,
    )).toEqual([perceptive]);
    expect(system.selectTargets(
      caster,
      { team: 'any', scope: 'single', filters: ['slowest'], maxTargets: 1 },
      units,
    )).toEqual([caster]);

    system.destroy();
  });

  it('uses direct action speed modifiers without changing speed', () => {
    const system = new TargetSelectionSystem();
    const caster = unit('caster', 20, 10);
    const target = unit('target', 10, 10);
    const baseSpeed = target.attributes.getValue(AttributeType.SPEED);
    target.attributes.addModifier({
      id: 'haste',
      attrType: AttributeType.ACTION_SPEED,
      type: ModifierType.ADD,
      value: 1,
      source: 'test',
    });

    expect(system.selectTargets(
      caster,
      { team: 'any', scope: 'single', filters: ['fastest'], maxTargets: 1 },
      [caster, target],
    )).toEqual([target]);
    expect(target.attributes.getValue(AttributeType.SPEED)).toBe(baseSpeed);

    system.destroy();
  });
});
