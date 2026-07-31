import { GameplayTags } from '@shared/engine/shared/tag-domain';
import { describe, expect, it } from 'vitest';
import {
  SectCompiler,
  SectRegistry,
  type SectBuildBuilder,
  type SectModule,
  type SectPathModule,
} from '..';
import {
  FIXTURE_SECT_MODULE,
  fixtureSectState,
} from '../../testing/fixtures/FixtureSectModule';

function replaceBaseBuilder(
  transform: (builder: SectBuildBuilder) => SectBuildBuilder,
): SectModule {
  return {
    definition: FIXTURE_SECT_MODULE.definition,
    paths: FIXTURE_SECT_MODULE.paths,
    progression: FIXTURE_SECT_MODULE.progression,
    methodGrowth: FIXTURE_SECT_MODULE.methodGrowth,
    organization: FIXTURE_SECT_MODULE.organization,
    createBaseSelectionStrategy: () =>
      FIXTURE_SECT_MODULE.createBaseSelectionStrategy(),
    createBaseBuilder: (context) =>
      transform(FIXTURE_SECT_MODULE.createBaseBuilder(context)),
    checkAdmission: (context) => FIXTURE_SECT_MODULE.checkAdmission(context),
  };
}

function replacePath(pathId: string, replacement: SectPathModule): SectModule {
  const paths = new Map(FIXTURE_SECT_MODULE.paths);
  paths.set(pathId, {
    definition: replacement.definition,
    nodes: replacement.nodes,
    compile: (context, builder) => replacement.compile(context, builder),
    createSelectionStrategy: (tacticId) =>
      replacement.createSelectionStrategy(tacticId),
  });
  return {
    definition: FIXTURE_SECT_MODULE.definition,
    paths,
    progression: FIXTURE_SECT_MODULE.progression,
    methodGrowth: FIXTURE_SECT_MODULE.methodGrowth,
    organization: FIXTURE_SECT_MODULE.organization,
    createBaseSelectionStrategy: () =>
      FIXTURE_SECT_MODULE.createBaseSelectionStrategy(),
    createBaseBuilder: (context) =>
      FIXTURE_SECT_MODULE.createBaseBuilder(context),
    checkAdmission: (context) => FIXTURE_SECT_MODULE.checkAdmission(context),
  };
}

describe('宗门模块扩展契约', () => {
  it('强制每个宗门指定一个入宗即解锁的被动作为宗门根基', () => {
    const missing = structuredClone(FIXTURE_SECT_MODULE.definition);
    delete (missing as Partial<typeof missing>).foundationPassiveId;
    expect(
      () => new SectRegistry([{ ...FIXTURE_SECT_MODULE, definition: missing }]),
    ).toThrow('必须且只能指定1个宗门根基被动');

    const unknown = structuredClone(FIXTURE_SECT_MODULE.definition);
    unknown.foundationPassiveId = 'missing-foundation';
    expect(
      () => new SectRegistry([{ ...FIXTURE_SECT_MODULE, definition: unknown }]),
    ).toThrow('根基被动不存在');

    const active = structuredClone(FIXTURE_SECT_MODULE.definition);
    active.foundationPassiveId = 'fixture-ability-2';
    expect(
      () => new SectRegistry([{ ...FIXTURE_SECT_MODULE, definition: active }]),
    ).toThrow('根基能力必须是被动');

    const gated = structuredClone(FIXTURE_SECT_MODULE.definition);
    const gatedFoundation = gated.abilities.find(
      (ability) => ability.id === gated.foundationPassiveId,
    )!;
    gatedFoundation.unlock = {
      type: 'method',
      methodId: 'fixture-method-6',
      level: 1,
    };
    expect(
      () => new SectRegistry([{ ...FIXTURE_SECT_MODULE, definition: gated }]),
    ).toThrow('根基被动必须入宗即解锁');
  });

  it('拒绝未知来源心法、空根基实现及携带流派标签的根基被动', () => {
    const unknownSource = structuredClone(FIXTURE_SECT_MODULE.definition);
    unknownSource.abilities.find(
      (ability) => ability.id === unknownSource.foundationPassiveId,
    )!.sourceMethodId = 'missing-method';
    expect(
      () =>
        new SectRegistry([
          { ...FIXTURE_SECT_MODULE, definition: unknownSource },
        ]),
    ).toThrow('未知来源心法');

    const emptyFoundation = replaceBaseBuilder((builder) =>
      builder.updateAbility(
        FIXTURE_SECT_MODULE.definition.foundationPassiveId,
        (ability) => ({
          ...ability,
          config: {
            ...ability.config,
            modifiers: undefined,
            listeners: undefined,
          },
        }),
      ),
    );
    expect(() => new SectRegistry([emptyFoundation])).toThrow(
      '根基被动不得为空',
    );

    const pathTaggedFoundation = replaceBaseBuilder((builder) =>
      builder.updateAbility(
        FIXTURE_SECT_MODULE.definition.foundationPassiveId,
        (ability) => ({
          ...ability,
          config: {
            ...ability.config,
            tags: [
              ...(ability.config.tags ?? []),
              GameplayTags.ABILITY.SECT.path(
                FIXTURE_SECT_MODULE.definition.id,
                FIXTURE_SECT_MODULE.definition.paths[0].id,
              ),
            ],
          },
        }),
      ),
    );
    expect(() => new SectRegistry([pathTaggedFoundation])).toThrow(
      '根基被动不得携带流派标签',
    );
  });

  it('根基被动不能通过主动栏重复进入战斗投影', () => {
    const state = fixtureSectState();
    state.abilityLoadout = [
      FIXTURE_SECT_MODULE.definition.foundationPassiveId,
      null,
      null,
      null,
    ];
    expect(() =>
      new SectCompiler().projectCombat(FIXTURE_SECT_MODULE, {
        sect: state,
        realm: '炼气',
      }),
    ).toThrow('根基被动战斗投影必须且只能出现1次');
  });

  it('第二宗门只通过模块注册即可完成定义、流派与战斗投影', () => {
    const registry = new SectRegistry([FIXTURE_SECT_MODULE]);
    const module = registry.require('fixture-sect');
    expect(module.definition.methods).toHaveLength(6);
    expect(module.definition.paths).toHaveLength(2);
    const build = module
      .createBaseBuilder({
        sect: {
          membershipId: 'm',
          sectId: 'fixture-sect',
          status: 'active',
          contribution: 0,
          configVersion: 1,
          methods: { 'fixture-method-1': 1 },
          paths: [],
          abilityLoadout: [null, null, null, null],
        },
        realm: '炼气',
        methodGrowth: module.methodGrowth,
      })
      .build();
    const defaultId = module.definition.abilities.find(
      (ability) => ability.kind === 'default',
    )!.id;
    expect(build.abilities[defaultId]).toBeDefined();
  });

  it('拒绝没有有效基础施法策略的宗门模块', () => {
    const invalid: SectModule = {
      definition: FIXTURE_SECT_MODULE.definition,
      paths: FIXTURE_SECT_MODULE.paths,
      progression: FIXTURE_SECT_MODULE.progression,
      methodGrowth: FIXTURE_SECT_MODULE.methodGrowth,
      organization: FIXTURE_SECT_MODULE.organization,
      createBaseSelectionStrategy: () => null as never,
      createBaseBuilder: (context) =>
        FIXTURE_SECT_MODULE.createBaseBuilder(context),
      checkAdmission: (context) => FIXTURE_SECT_MODULE.checkAdmission(context),
    };

    expect(() => new SectRegistry([invalid])).toThrow('未实现基础施法策略');

    const missing = { ...invalid } as Partial<SectModule>;
    delete missing.createBaseSelectionStrategy;
    expect(() => new SectRegistry([missing as SectModule])).toThrow(
      '未实现基础施法策略',
    );
  });

  it('拒绝有定义但没有插件的参悟节点', () => {
    const path = FIXTURE_SECT_MODULE.paths.get('fixture-first-path')!;
    const nodes = new Map(path.nodes);
    nodes.delete(path.definition.nodes[0].id);
    const invalid = replacePath(path.definition.id, {
      definition: path.definition,
      nodes,
      compile: (context, builder) => path.compile(context, builder),
      createSelectionStrategy: (tacticId) =>
        path.createSelectionStrategy(tacticId),
    });
    expect(() => new SectRegistry([invalid])).toThrow('缺少节点插件');
  });

  it('拒绝不同宗门复用同一战斗资源ID', () => {
    const duplicateResourceModule: SectModule = {
      definition: {
        ...FIXTURE_SECT_MODULE.definition,
        id: 'fixture-sect-two',
        name: '第二测试宗门',
      },
      paths: FIXTURE_SECT_MODULE.paths,
      progression: FIXTURE_SECT_MODULE.progression,
      methodGrowth: FIXTURE_SECT_MODULE.methodGrowth,
      organization: FIXTURE_SECT_MODULE.organization,
      createBaseSelectionStrategy: () =>
        FIXTURE_SECT_MODULE.createBaseSelectionStrategy(),
      createBaseBuilder: (context) =>
        FIXTURE_SECT_MODULE.createBaseBuilder(context),
      checkAdmission: (context) => FIXTURE_SECT_MODULE.checkAdmission(context),
    };
    const registry = new SectRegistry([FIXTURE_SECT_MODULE]);
    expect(() => registry.register(duplicateResourceModule)).toThrow(
      '宗门战斗资源ID重复',
    );
  });

  it('拒绝跨流派重复的节点和战术ID', () => {
    const duplicateNodeDefinition = structuredClone(
      FIXTURE_SECT_MODULE.definition,
    );
    duplicateNodeDefinition.paths[1].nodes[0].id =
      duplicateNodeDefinition.paths[0].nodes[0].id;
    expect(
      () =>
        new SectRegistry([
          { ...FIXTURE_SECT_MODULE, definition: duplicateNodeDefinition },
        ]),
    ).toThrow('跨流派重复节点ID');

    const duplicateTacticDefinition = structuredClone(
      FIXTURE_SECT_MODULE.definition,
    );
    duplicateTacticDefinition.paths[1].tactics[0].id =
      duplicateTacticDefinition.paths[0].tactics[0].id;
    expect(
      () =>
        new SectRegistry([
          { ...FIXTURE_SECT_MODULE, definition: duplicateTacticDefinition },
        ]),
    ).toThrow('跨流派重复战术ID');
  });

  it('拒绝未解锁默认能力的入宗配置', () => {
    const onboardingDefinition = structuredClone(
      FIXTURE_SECT_MODULE.definition,
    );
    onboardingDefinition.onboarding.initialMethods['fixture-method-1'] = 0;
    expect(
      () =>
        new SectRegistry([
          { ...FIXTURE_SECT_MODULE, definition: onboardingDefinition },
        ]),
    ).toThrow('未解锁默认能力');
  });
});
