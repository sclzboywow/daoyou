import {
  requireActiveCultivatorRef,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import * as creationProductRepository from '@server/lib/repositories/creationProductRepository';
import {
  CreationProductCommandError,
  deleteCreationProduct,
  toggleCreationProduct,
} from '@server/lib/services/CreationProductApplicationService';
import { toPlayerStateMutationResponse } from '@server/lib/services/ResourceMutationResponse';
import { rehydrateStoredProductModel } from '@shared/engine/creation-v2/persistence/ProductPersistenceMapper';
import type { CreationProductType } from '@shared/engine/creation-v2/types';
import type { ElementType } from '@shared/types/constants';
import { Hono } from 'hono';
import { z } from 'zod';

const VALID_TYPES = new Set(['skill', 'gongfa', 'artifact']);
const EquipSchema = z.object({
  productId: z.string().uuid(),
});

const router = new Hono<AppEnv>();

function withRehydratedProductModel<
  T extends { productModel?: unknown; element?: string | null },
>(product: T): T {
  const productModel = rehydrateStoredProductModel(
    (product.productModel ?? null) as Record<string, unknown> | null,
    (product.element as ElementType | null) ?? undefined,
  );

  if (!productModel) {
    return product;
  }

  return {
    ...product,
    productModel,
  };
}

router.get('/', requireActiveCultivatorRef(), async (c) => {
  const ref = c.get('activeCultivatorRef');
  if (!ref) {
    return c.json({ error: '当前没有活跃角色' }, 404);
  }

  const type = c.req.query('type');
  if (!type || !VALID_TYPES.has(type)) {
    return c.json(
      { error: '请指定有效的产物类型 (skill|gongfa|artifact)' },
      400,
    );
  }

  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(c.req.query('pageSize') || '20', 10)),
  );
  const [total, products] = await Promise.all([
    creationProductRepository.countByType(
      ref.cultivatorId,
      type as CreationProductType,
    ),
    creationProductRepository.findByTypeAndCultivatorPage(
      ref.cultivatorId,
      type as CreationProductType,
      { page, pageSize },
    ),
  ]);
  const totalPages = Math.ceil(total / pageSize);

  return c.json({
    success: true,
    data: {
      items: products.map(withRehydratedProductModel),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    },
  });
});

router.post('/equip', requireActiveCultivatorRef(), async (c) => {
  const user = c.get('user');
  const cultivator = c.get('activeCultivatorRef');
  if (!user || !cultivator) {
    return c.json({ error: '未授权访问' }, 401);
  }

  const { productId } = EquipSchema.parse(await c.req.json());
  try {
    const committed = await toggleCreationProduct({
      userId: user.id,
      cultivatorId: cultivator.cultivatorId,
      productId,
    });
    const response = toPlayerStateMutationResponse(committed);
    return c.json({ ...response, equipped: committed.result.equipped });
  } catch (error) {
    if (error instanceof CreationProductCommandError) {
      return c.json(
        {
          success: false,
          error: error.message,
          ...(error.code ? { code: error.code } : {}),
        },
        error.status,
      );
    }
    throw error;
  }
});

router.get('/:id', requireActiveCultivatorRef(), async (c) => {
  const cultivator = c.get('activeCultivatorRef');
  if (!cultivator) {
    return c.json({ error: '当前没有活跃角色' }, 404);
  }

  const product = await creationProductRepository.findById(c.req.param('id'));
  if (!product || product.cultivatorId !== cultivator.cultivatorId) {
    return c.json({ error: '产物不存在' }, 404);
  }

  return c.json({ success: true, data: withRehydratedProductModel(product) });
});

router.delete('/:id', requireActiveCultivatorRef(), async (c) => {
  const user = c.get('user');
  const cultivator = c.get('activeCultivatorRef');
  if (!user || !cultivator) {
    return c.json({ error: '未授权访问' }, 401);
  }

  const id = c.req.param('id');
  try {
    const committed = await deleteCreationProduct({
      userId: user.id,
      cultivatorId: cultivator.cultivatorId,
      productId: id,
    });
    return c.json(toPlayerStateMutationResponse(committed));
  } catch (error) {
    if (error instanceof CreationProductCommandError) {
      return c.json({ error: error.message }, error.status);
    }
    throw error;
  }
});

export default router;
