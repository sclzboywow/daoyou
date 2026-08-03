export const ACTION_STATE_TYPES = [
  'rest',
  'queued_action',
  'ability_mode',
] as const;

export const ACTION_STATE_PHASES = [
  'entered',
  'triggered',
  'cancelled',
  'skipped',
] as const;

export type ActionStateType = (typeof ACTION_STATE_TYPES)[number];
export type ActionStatePhase = (typeof ACTION_STATE_PHASES)[number];
export type ActionInterruptPolicy = 'normal' | 'uninterruptible';
export type ActionHitPolicy = 'normal' | 'guaranteed';

export function isActionStateType(value: unknown): value is ActionStateType {
  return ACTION_STATE_TYPES.includes(value as ActionStateType);
}

export function isActionStatePhase(value: unknown): value is ActionStatePhase {
  return ACTION_STATE_PHASES.includes(value as ActionStatePhase);
}

export interface ActionStateAbilityView {
  id: string;
  name: string;
}

export interface ActionStateView {
  type: ActionStateType;
  name: string;
  remainingActions: number;
  sourceAbility?: ActionStateAbilityView;
  ability?: ActionStateAbilityView;
  interruptPolicy?: ActionInterruptPolicy;
  hitPolicy?: ActionHitPolicy;
}
