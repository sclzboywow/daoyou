import type { DbTransaction } from '@server/lib/drizzle/db';
import * as creationProductRepository from '@server/lib/repositories/creationProductRepository';
import { MAX_EQUIPPED_GONGFA } from '@shared/config/creationProductLimits';
import { SELF_CREATED_SKILL_EQUIP_FROZEN_ERROR } from '@shared/config/selfCreatedSkillFreeze';
import { DEFAULT_MAX_ACTIVE_SKILLS } from '@shared/config/skillLimits';
import type { ResourceChangeDescriptor } from '@shared/contracts/resources';
import type { CreationProductType } from '@shared/engine/creation-v2/types';
import { getCreationProductTypeLabel } from '@shared/lib/gameConceptDisplay';
import {
  EQUIPMENT_SLOT_VALUES,
  type EquipmentSlot,
} from '@shared/types/constants';
import {
  getPlayerLoadoutByCultivatorId,
} from '@server/lib/services/cultivator/CultivatorLoadoutReader';
import { toArtifactFromProduct } from './creationProductArtifactSupport';
import { playerCommandExecutor } from './CommandExecutors';

type ProductMutationResult = {
  productId: string;
  productType: CreationProductType;
  equipped?: boolean;
};

async function resourceChanges(args: {
  cultivatorId: string;
  eventType: string;
  tx: DbTransaction;
}): Promise<ResourceChangeDescriptor[]> {
  const loadout = await getPlayerLoadoutByCultivatorId(
    args.cultivatorId,
    args.tx,
  );
  return [
    {
      resourceTopic: 'player.loadout',
      eventType: args.eventType,
      operation: 'replace',
      payload: loadout,
    },
  ];
}

export async function executeArtifactEquipCommand(args: {
  cultivatorId: string;
  productId: string;
  productType: CreationProductType;
  slot: string;
  currentlyEquipped: boolean;
  tx: DbTransaction;
}) {
  if (!EQUIPMENT_SLOT_VALUES.includes(args.slot as EquipmentSlot)) {
    throw new Error('法宝槽位无效');
  }
  const slot = args.slot as EquipmentSlot;
  if (args.currentlyEquipped) {
    await creationProductRepository.unequipArtifact(args.productId, args.tx);
  } else {
    await creationProductRepository.equipArtifact(
      args.productId,
      args.cultivatorId,
      slot,
      args.tx,
    );
  }
  const result: ProductMutationResult = {
    productId: args.productId,
    productType: args.productType,
    equipped: !args.currentlyEquipped,
  };
  return {
    result,
    resourceChanges: await resourceChanges({
      cultivatorId: args.cultivatorId,
      eventType: 'loadout.equipped',
      tx: args.tx,
    }),
  };
}

export async function executeProductEquippedCommand(args: {
  cultivatorId: string;
  productId: string;
  productType: CreationProductType;
  equipped: boolean;
  tx: DbTransaction;
}) {
  await creationProductRepository.setProductEquipped(
    args.productId,
    args.equipped,
    args.tx,
  );
  const result: ProductMutationResult = {
    productId: args.productId,
    productType: args.productType,
    equipped: args.equipped,
  };
  return {
    result,
    resourceChanges: await resourceChanges({
      cultivatorId: args.cultivatorId,
      eventType: 'loadout.equipped',
      tx: args.tx,
    }),
  };
}

export async function executeProductDeleteCommand(args: {
  cultivatorId: string;
  productId: string;
  productType: CreationProductType;
  tx: DbTransaction;
}) {
  await creationProductRepository.deleteById(args.productId, args.tx);
  const result: ProductMutationResult = {
    productId: args.productId,
    productType: args.productType,
  };
  const changes = await resourceChanges({
    cultivatorId: args.cultivatorId,
    eventType: 'loadout.deleted',
    tx: args.tx,
  });
  if (args.productType === 'artifact') {
    changes.push({
      resourceTopic: 'inventory.artifacts',
      eventType: 'inventory.artifact.deleted',
      operation: 'remove-items',
      payload: { idKey: 'id', ids: [args.productId] },
    });
  }
  return {
    result,
    resourceChanges: changes,
  };
}

export class CreationProductCommandError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function toggleCreationProduct(args: {
  userId: string;
  cultivatorId: string;
  productId: string;
}) {
  return playerCommandExecutor.executeWithLock({
    userId: args.userId,
    cultivatorId: args.cultivatorId,
    source: 'product_equip',
    command: async (tx) => {
      const product = await creationProductRepository.findById(
        args.productId,
        tx,
      );
      if (!product || product.cultivatorId !== args.cultivatorId) {
        throw new CreationProductCommandError(
          '产物不存在或不属于你',
          404,
        );
      }
      const productType = product.productType as CreationProductType;
      if (!['skill', 'gongfa', 'artifact'].includes(productType)) {
        throw new CreationProductCommandError('产物类型无效', 400);
      }
      if (productType === 'artifact') {
        if (!product.slot) {
          throw new CreationProductCommandError('法宝缺少槽位信息', 400);
        }
        return executeArtifactEquipCommand({
          cultivatorId: args.cultivatorId,
          productId: args.productId,
          productType,
          slot: product.slot,
          currentlyEquipped: product.isEquipped,
          tx,
        });
      }
      if (!product.isEquipped && productType === 'skill') {
        throw new CreationProductCommandError(
          SELF_CREATED_SKILL_EQUIP_FROZEN_ERROR,
          409,
          'SELF_CREATED_SKILL_EQUIP_FROZEN',
        );
      }
      if (!product.isEquipped) {
        const maxEquipped =
          productType === 'skill'
            ? DEFAULT_MAX_ACTIVE_SKILLS
            : MAX_EQUIPPED_GONGFA;
        const equippedCount =
          await creationProductRepository.countEquippedByType(
            args.cultivatorId,
            productType,
            tx,
          );
        if (equippedCount >= maxEquipped) {
          throw new CreationProductCommandError(
            `${getCreationProductTypeLabel(productType)}启用数量已达上限，请先停用旧项`,
            409,
          );
        }
      }
      return executeProductEquippedCommand({
        cultivatorId: args.cultivatorId,
        productId: args.productId,
        productType,
        equipped: !product.isEquipped,
        tx,
      });
    },
  });
}

export async function deleteCreationProduct(args: {
  userId: string;
  cultivatorId: string;
  productId: string;
}) {
  return playerCommandExecutor.executeWithLock({
    userId: args.userId,
    cultivatorId: args.cultivatorId,
    source: 'product_delete',
    command: async (tx) => {
      const product = await creationProductRepository.findById(
        args.productId,
        tx,
      );
      if (!product || product.cultivatorId !== args.cultivatorId) {
        throw new CreationProductCommandError(
          '产物不存在或不属于你',
          404,
        );
      }
      return executeProductDeleteCommand({
        cultivatorId: args.cultivatorId,
        productId: args.productId,
        productType: product.productType as CreationProductType,
        tx,
      });
    },
  });
}

export async function toggleArtifactLoadout(args: {
  userId: string;
  cultivatorId: string;
  artifactId: string;
}) {
  return playerCommandExecutor.executeWithLock({
    userId: args.userId,
    cultivatorId: args.cultivatorId,
    source: 'artifact_equip',
    command: async (tx) => {
      const product = await creationProductRepository.findById(
        args.artifactId,
        tx,
      );
      if (
        !product ||
        product.cultivatorId !== args.cultivatorId ||
        product.productType !== 'artifact'
      ) {
        throw new CreationProductCommandError(
          '装备不存在或无权限操作',
          404,
        );
      }
      if (product.isEquipped) {
        await creationProductRepository.unequipArtifact(args.artifactId, tx);
      } else {
        await creationProductRepository.equipArtifact(
          args.artifactId,
          args.cultivatorId,
          product.slot || 'weapon',
          tx,
        );
      }
      const equippedArtifacts =
        await creationProductRepository.findEquippedArtifacts(
          args.cultivatorId,
          tx,
        );
      const result = {
        weapon:
          equippedArtifacts.find((item) => item.slot === 'weapon')?.id ?? null,
        armor:
          equippedArtifacts.find((item) => item.slot === 'armor')?.id ?? null,
        accessory:
          equippedArtifacts.find((item) => item.slot === 'accessory')?.id ??
          null,
      };
      const loadout = await getPlayerLoadoutByCultivatorId(
        args.cultivatorId,
        tx,
      );
      const updatedProduct = await creationProductRepository.findById(
        args.artifactId,
        tx,
      );
      if (!updatedProduct) {
        throw new Error('法宝状态更新后无法读取权威投影');
      }
      const artifact = toArtifactFromProduct(updatedProduct);
      const resourceChanges: ResourceChangeDescriptor[] = [
        {
          resourceTopic: 'player.loadout',
          eventType: 'loadout.artifact.equipped',
          operation: 'replace',
          payload: loadout,
        },
        {
          resourceTopic: 'inventory.artifacts',
          eventType: 'inventory.artifact.equipped',
          operation: 'upsert-items',
          payload: { idKey: 'id', items: [artifact] },
        },
      ];
      return { result, resourceChanges };
    },
  });
}
