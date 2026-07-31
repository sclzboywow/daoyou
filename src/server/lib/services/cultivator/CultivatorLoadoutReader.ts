import * as creationProductRepository from '@server/lib/repositories/creationProductRepository';
import {
  getExecutor,
  runDbTasks,
  type DbExecutor,
  type DbTransaction,
} from '@server/lib/drizzle/db';
import type { PlayerLoadout } from '@shared/contracts/player';
import type { AbilityConfig } from '@shared/engine/creation-v2/contracts/battle';
import { projectAbilityConfig } from '@shared/engine/creation-v2/models/AbilityProjection';
import {
  rehydrateStoredProductModel,
} from '@shared/engine/creation-v2/persistence/ProductPersistenceMapper';
import type {
  ElementType,
  Quality,
} from '@shared/types/constants';
import type { Cultivator, EquippedItems } from '@shared/types/cultivator';
import { mapArtifactRow } from './CultivatorInventoryRepository';
import { toArtifactFromProduct } from '../creationProductArtifactSupport';

function productModelToAbilityConfig(
  productModel: Record<string, unknown> | null | undefined,
  element: string | null | undefined,
  id: string,
): AbilityConfig {
  const rehydrated = rehydrateStoredProductModel(
    productModel as Record<string, unknown>,
    (element as ElementType) || undefined,
  );
  if (!rehydrated) return { slug: id } as AbilityConfig;
  return { ...projectAbilityConfig(rehydrated), slug: id };
}

function productModelToRuntimeModel(
  productModel: Record<string, unknown> | null | undefined,
  element: string | null | undefined,
) {
  return rehydrateStoredProductModel(
    productModel as Record<string, unknown>,
    (element as ElementType) || undefined,
  );
}

export function mapLoadoutFromProducts(
  products: Awaited<
    ReturnType<typeof creationProductRepository.findEquippedByType>
  >[],
): PlayerLoadout {
  const flatProducts = products.flat();
  const skillProducts = flatProducts.filter(
    (product) => product.productType === 'skill' && product.isEquipped,
  );
  const gongfaProducts = flatProducts.filter(
    (product) => product.productType === 'gongfa' && product.isEquipped,
  );
  const artifactProducts = flatProducts.filter(
    (product) => product.productType === 'artifact' && product.isEquipped,
  );

  const cultivations: Cultivator['cultivations'] = gongfaProducts.map(
    (product) => {
      const rehydratedModel = productModelToRuntimeModel(
        product.productModel as Record<string, unknown>,
        product.element,
      );
      const abilityConfig = productModelToAbilityConfig(
        product.productModel as Record<string, unknown>,
        product.element,
        product.id,
      );
      return {
        id: product.id,
        name: product.name,
        element: (product.element as ElementType) || undefined,
        quality: product.quality as Quality | undefined,
        score: product.score || 0,
        description: product.description || undefined,
        attributeModifiers: abilityConfig.modifiers ?? [],
        abilityConfig,
        productModel: rehydratedModel ?? product.productModel ?? undefined,
      };
    },
  );

  const skills: Cultivator['skills'] = skillProducts.map((product) => {
    const rehydratedModel = productModelToRuntimeModel(
      product.productModel as Record<string, unknown>,
      product.element,
    );
    const abilityConfig = productModelToAbilityConfig(
      product.productModel as Record<string, unknown>,
      product.element,
      product.id,
    );
    return {
      id: product.id,
      name: product.name,
      element: (product.element as ElementType) || '金',
      quality: product.quality as Quality | undefined,
      cost: abilityConfig.mpCost || undefined,
      cooldown: abilityConfig.cooldown ?? 0,
      target_self:
        abilityConfig.targetPolicy?.team === 'self' ? true : undefined,
      description: product.description || undefined,
      abilityConfig,
      productModel: rehydratedModel ?? product.productModel ?? undefined,
    };
  });
  const artifacts = artifactProducts.map((artifact) =>
    mapArtifactRow(toArtifactFromProduct(artifact)),
  );
  const equipped: EquippedItems = {
    weapon:
      artifactProducts.find((product) => product.slot === 'weapon')?.id ?? null,
    armor:
      artifactProducts.find((product) => product.slot === 'armor')?.id ?? null,
    accessory:
      artifactProducts.find((product) => product.slot === 'accessory')?.id ??
      null,
  };
  return { skills, cultivations, artifacts, equipped };
}

export async function getPlayerLoadoutByCultivatorId(
  cultivatorId: string,
  executor?: DbExecutor | DbTransaction,
): Promise<PlayerLoadout> {
  const q = executor ?? getExecutor();
  const [skills, cultivations, artifacts] = await runDbTasks(q, [
    () =>
      creationProductRepository.findEquippedByType(
        cultivatorId,
        'skill',
        q,
      ),
    () =>
      creationProductRepository.findEquippedByType(
        cultivatorId,
        'gongfa',
        q,
      ),
    () =>
      creationProductRepository.findEquippedByType(
        cultivatorId,
        'artifact',
        q,
      ),
  ]);
  return mapLoadoutFromProducts([skills, cultivations, artifacts]);
}
