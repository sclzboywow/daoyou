// engine/battle-v5/systems/ActionExecutionSystem.ts
import { ActiveSkill } from '../abilities/ActiveSkill';
import { EventBus } from '../core/EventBus';
import {
  ActionStateEvent,
  EventPriorityLevel,
  SkillCastEvent,
  SkillInterruptEvent,
  SkillPreCastEvent,
} from '../core/events';
import { CombatResultEmitterV3 } from '../v3/CombatResultEmitterV3';
import { combatCarrierFromAbilityV3 } from '../v3/origin';

/**
 * ActionExecutionSystem - 行动执行系统
 *
 * EDA 架构设计：
 * - 订阅 SkillPreCastEvent（施法前摇事件）
 * - 检查施法是否被打断
 * - 发布 SkillCastEvent（技能正式释放事件）
 * - 调用 Ability.execute() 执行技能效果
 *
 * 职责边界：
 * - 此系统负责：施法流程控制、打断判定、技能执行
 * - AbilityContainer 负责：技能筛选、发布前摇事件
 * - ActiveSkill.execute 负责：MP消耗、冷却启动、技能效果
 */
export class ActionExecutionSystem {
  private _handlers: Map<string, (event: SkillPreCastEvent) => void> =
    new Map();

  constructor() {
    this._subscribeToEvents();
  }

  private _subscribeToEvents(): void {
    const preCastHandler = (event: SkillPreCastEvent) =>
      this._onSkillPreCast(event);
    EventBus.instance.subscribe<SkillPreCastEvent>(
      'SkillPreCastEvent',
      preCastHandler,
      EventPriorityLevel.SKILL_PRE_CAST,
    );
    this._handlers.set('SkillPreCastEvent', preCastHandler);
  }

  /**
   * 处理施法前摇事件
   * EDA 模式：通过订阅 SkillPreCastEvent 被动触发
   */
  private _onSkillPreCast(event: SkillPreCastEvent): void {
    const eventTrace = event.trace;
    if (!eventTrace) {
      throw new Error('SkillPreCastEvent has no V3 trace');
    }
    // 检查是否被打断
    if (event.isInterrupted && event.interruptPolicy !== 'uninterruptible') {
      event.ability.cancelPreparedCast();
      const interruptedOrigin = {
        kind: 'owned' as const,
        owner: { id: event.caster.id, name: event.caster.name },
        carrier: combatCarrierFromAbilityV3(event.ability),
      };
      EventBus.instance.runInCausalContext(
        {
          origin: interruptedOrigin,
          trace: eventTrace,
        },
        () => {
          new CombatResultEmitterV3().commit(
            event.caster,
            {
              type: 'defense',
              defense: 'interrupt',
            },
            { origin: interruptedOrigin, parentTrace: eventTrace },
          );
          EventBus.instance.publish<SkillInterruptEvent>({
            type: 'SkillInterruptEvent',
            timestamp: Date.now(),
            caster: event.caster,
            target: event.target,
            ability: event.ability,
            reason: '施法被打断',
          });
          if (event.queuedActionState) {
            new CombatResultEmitterV3().commit(
              event.caster,
              {
                type: 'action_state',
                stateType: 'queued_action',
                phase: 'cancelled',
                name: event.queuedActionState.name,
                remainingActions: 0,
                ability: { id: event.ability.id, name: event.ability.name },
              },
              { origin: interruptedOrigin, parentTrace: eventTrace },
            );
            EventBus.instance.publish<ActionStateEvent>({
              type: 'ActionStateEvent',
              timestamp: Date.now(),
              unit: event.caster,
              stateType: 'queued_action',
              phase: 'cancelled',
              name: event.queuedActionState.name,
              remainingActions: 0,
              sourceAbility: event.queuedActionState.sourceAbility,
              ability: { id: event.ability.id, name: event.ability.name },
              reason: '施法被打断',
            });
          }
        },
      );
      return;
    }

    let ability = event.ability;
    let target = event.target;
    if (
      ability instanceof ActiveSkill &&
      !ability.canExecutePreparedCast(event.caster)
    ) {
      ability.cancelPreparedCast();
      const fallbackTarget = event.fallbackTarget;
      if (
        !fallbackTarget ||
        fallbackTarget === event.caster ||
        !fallbackTarget.isAlive()
      ) {
        return;
      }
      const fallback = event.caster.abilities.getFallbackBasicAttack();
      fallback.prepareCast({ caster: event.caster, target: fallbackTarget });
      ability = fallback;
      target = fallbackTarget;
    } else if (ability instanceof ActiveSkill && ability.preparedTarget) {
      target = ability.preparedTarget;
    }

    // 未被打断，发布技能释放事件
    const castEvent: SkillCastEvent = {
      type: 'SkillCastEvent',
      timestamp: Date.now(),
      caster: event.caster,
      target,
      ability,
      interruptPolicy: event.interruptPolicy,
      hitPolicy: event.hitPolicy,
    };

    const origin = {
      kind: 'owned' as const,
      owner: { id: event.caster.id, name: event.caster.name },
      carrier: combatCarrierFromAbilityV3(ability),
    };
    const sequence = EventBus.instance.getCurrentSequence();
    if (sequence?.phase === 'action') {
      sequence.ability = { id: ability.id, name: ability.name };
    }
    const publishedCast = EventBus.instance.runInCausalContext(
      { origin, trace: eventTrace },
      () => EventBus.instance.publish(castEvent),
    );
    const castTrace = publishedCast.trace;
    if (!castTrace) throw new Error('SkillCastEvent has no V3 trace');

    EventBus.instance.runInCausalContext({ origin, trace: castTrace }, () => {
      if (event.queuedActionState) {
        new CombatResultEmitterV3().commit(
          event.caster,
          {
            type: 'action_state',
            stateType: 'queued_action',
            phase: 'triggered',
            name: event.queuedActionState.name,
            remainingActions: 0,
            ability: { id: ability.id, name: ability.name },
          },
          { origin, parentTrace: castTrace },
        );
        EventBus.instance.publish<ActionStateEvent>({
          type: 'ActionStateEvent',
          timestamp: Date.now(),
          unit: event.caster,
          stateType: 'queued_action',
          phase: 'triggered',
          name: event.queuedActionState.name,
          remainingActions: 0,
          sourceAbility: event.queuedActionState.sourceAbility,
          ability: { id: ability.id, name: ability.name },
        });
      }

      ability.execute({
        caster: event.caster,
        target,
        shouldApplyEffects: castEvent.isHit !== false,
      });
    });
  }

  /**
   * 销毁系统，取消订阅
   */
  destroy(): void {
    for (const [eventType, handler] of this._handlers) {
      EventBus.instance.unsubscribe(eventType, handler);
    }
    this._handlers.clear();
  }
}
