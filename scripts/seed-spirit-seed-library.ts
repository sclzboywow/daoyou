/**
 * 将 curated 灵种目录写入材料库，补齐 seed × 各品阶覆盖目标。
 *
 * Usage:
 *   DATABASE_URL=... bun run scripts/seed-spirit-seed-library.ts
 *   DATABASE_URL=... bun run scripts/seed-spirit-seed-library.ts --dry-run
 */
import {
  createItemLibraryEntry,
  findItemLibraryByItemIds,
  updateItemLibraryEntry,
} from '@server/lib/repositories/itemLibraryRepository';
import {
  DAILY_MATERIAL_LIBRARY_TARGETS,
  ITEM_LIBRARY_SYSTEM_USER_ID,
} from '@server/lib/services/MaterialLibraryService';
import {
  assertSpiritSeedCatalogCoverage,
  listSpiritSeedCatalogEntries,
} from '@shared/engine/material/creation/spiritSeedCatalog';
import type { CreateItemLibraryEntry } from '@shared/lib/itemLibrary';
import type { Quality } from '@shared/types/constants';

const dryRun = process.argv.includes('--dry-run');

function buildEntries(): CreateItemLibraryEntry[] {
  assertSpiritSeedCatalogCoverage(DAILY_MATERIAL_LIBRARY_TARGETS.seed);
  return listSpiritSeedCatalogEntries().map(({ quality, index, itemId, preset }) => ({
    itemId,
    type: 'material' as const,
    status: 'published' as const,
    payload: {
      name: preset.name,
      type: 'seed' as const,
      rank: quality,
      element: preset.element,
      description: preset.description,
    },
    editorConfig: {
      source: 'spirit_seed_catalog',
      catalogIndex: index,
      generatedAt: new Date().toISOString(),
    },
  }));
}

async function main() {
  const entries = buildEntries();
  const byQuality = entries.reduce(
    (acc, entry) => {
      const quality = entry.payload.rank as Quality;
      acc[quality] = (acc[quality] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<Quality, number>>,
  );

  console.log(
    JSON.stringify(
      {
        dryRun,
        total: entries.length,
        byQuality,
        targets: DAILY_MATERIAL_LIBRARY_TARGETS.seed,
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    console.log(
      entries
        .map(
          (entry) =>
            `${entry.itemId}\t${entry.payload.rank}\t${entry.payload.element}\t${entry.payload.name}`,
        )
        .join('\n'),
    );
    return;
  }

  const existing = new Map(
    (await findItemLibraryByItemIds(entries.map((entry) => entry.itemId))).map(
      (entry) => [entry.itemId, entry],
    ),
  );

  let created = 0;
  let updated = 0;
  for (const entry of entries) {
    const current = existing.get(entry.itemId);
    if (current) {
      await updateItemLibraryEntry({
        id: current.id,
        entry,
        userId: ITEM_LIBRARY_SYSTEM_USER_ID,
      });
      updated += 1;
    } else {
      await createItemLibraryEntry({
        entry,
        userId: ITEM_LIBRARY_SYSTEM_USER_ID,
      });
      created += 1;
    }
  }

  console.log(JSON.stringify({ created, updated, total: entries.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
