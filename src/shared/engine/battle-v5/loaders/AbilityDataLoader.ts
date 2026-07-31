import { eq } from 'drizzle-orm';
import { db } from '@server/lib/drizzle/db';
import { creationProducts } from '@server/lib/drizzle/schema';
import { deserializeAndRehydrate } from '../../creation-v2/persistence/ProductPersistenceMapper';
import { projectAbilityConfig } from '../../creation-v2/models/AbilityProjection';
import { Ability } from '../abilities/Ability';
import { AbilityFactory } from '../factories/AbilityFactory';
import type { ElementType } from '@shared/types/constants';

export class AbilityDataLoader {
  static async loadForCultivatorV2(cultivatorId: string): Promise<Ability[]> {
    const database = db;

    const rows = await database
      .select()
      .from(creationProducts)
      .where(eq(creationProducts.cultivatorId, cultivatorId));

    const abilities: Ability[] = [];

    for (const row of rows) {
      if (!row.isEquipped) continue;

      try {
        const rehydrated = deserializeAndRehydrate(
          row.productModel as Record<string, unknown>,
          (row.element as ElementType) || undefined,
        );
        const config = projectAbilityConfig(rehydrated);
        const ability = AbilityFactory.create({ ...config, slug: row.id });
        abilities.push(ability);
      } catch (err) {
        console.warn(
          `[AbilityDataLoader] Failed to load ability for product ${row.id}:`,
          err,
        );
      }
    }

    return abilities;
  }
}
