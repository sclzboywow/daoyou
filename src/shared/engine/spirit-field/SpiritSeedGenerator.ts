import { MaterialGenerator } from '@shared/engine/material/creation/MaterialGenerator';
import type {
  MaterialRandomOptions,
  MaterialSkeleton,
} from '@shared/engine/material/creation/types';
import type { ElementType, Quality } from '@shared/types/constants';
import type { Material } from '@shared/types/cultivator';
import { getSpiritFieldQualityBalance } from './config';
import { buildSpiritFieldSeedMaterialFromPlant } from './seedMaterial';
import type { SpiritFieldPlantSnapshot } from './types';

export interface SpiritSeedBatchSpec {
  rank: Quality;
  quantity: number;
  element?: ElementType;
}

export class SpiritSeedGenerator {
  /**
   * 参考 MaterialGenerator 的“规则骨架 -> AI 表现层 -> fallback”流程。
   * 灵田只补充种植数值快照，不再维护具体灵植硬编码目录。
   */
  static async generateRandom(
    count: number,
    options: Omit<MaterialRandomOptions, 'specifiedType'> = {},
  ): Promise<Array<Omit<Material, 'id'>>> {
    const skeletons = MaterialGenerator.generateRandomSkeletons(count, {
      ...options,
      specifiedType: 'herb',
    }).map((skeleton) => ({
      ...skeleton,
      type: 'herb' as const,
      quantity: 1,
    }));
    return this.generateFromSkeletons(skeletons, skeletons.map(() => 1));
  }

  static async generateBatches(
    batches: readonly SpiritSeedBatchSpec[],
  ): Promise<Array<Omit<Material, 'id'>>> {
    const skeletons: MaterialSkeleton[] = batches.map((batch) => ({
      type: 'herb',
      rank: batch.rank,
      quantity: 1,
      forcedElement: batch.element,
    }));
    return this.generateFromSkeletons(
      skeletons,
      batches.map((batch) => Math.max(1, Math.floor(batch.quantity))),
    );
  }

  private static async generateFromSkeletons(
    skeletons: MaterialSkeleton[],
    quantities: number[],
  ): Promise<Array<Omit<Material, 'id'>>> {
    const crops = await MaterialGenerator.generateFromSkeletons(skeletons);
    return crops.map((crop, index) => {
      const balance = getSpiritFieldQualityBalance(crop.rank);
      const plant: SpiritFieldPlantSnapshot = {
        id: globalThis.crypto.randomUUID(),
        name: crop.name,
        seedName: `${crop.name}灵种`,
        quality: crop.rank,
        element: crop.element,
        minRealm: balance.minRealm,
        baseGrowthMs: balance.growthMs,
        careSlots: balance.careSlots,
        careCooldownMs: balance.careCooldownMs,
        description: crop.description,
        baseYieldMin: balance.baseYield[0],
        baseYieldMax: balance.baseYield[1],
      };
      return buildSpiritFieldSeedMaterialFromPlant(
        plant,
        quantities[index] ?? 1,
      );
    });
  }
}
