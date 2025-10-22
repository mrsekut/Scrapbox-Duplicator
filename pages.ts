import { exportPages, getProfile } from '@cosense/std';
import { Effect } from 'effect';

type ImportPage = {
  title: string;
  lines: {
    text: string;
    created: number;
    updated: number;
  }[];
};

const BATCH_SIZE = 100; // Number of pages to import per batch
export function importPagesToProject(
  importingProjectName: string,
  pages: ImportPage[],
  sid: string,
) {
  return Effect.gen(function* () {
    if (pages.length === 0) {
      console.log('No page to be imported found.');
      return;
    }

    console.log(
      `Importing ${pages.length} pages to "/${importingProjectName}" in batches of ${BATCH_SIZE}...`,
    );

    yield* processBatchesEffect(
      pages,
      BATCH_SIZE,
      (batch, batchNumber, totalBatches) =>
        Effect.gen(function* () {
          console.log(
            `Importing batch ${batchNumber}/${totalBatches} (${batch.length} pages)...`,
          );

          yield* importPages(importingProjectName, batch, sid);

          console.log(
            `✓ Batch ${batchNumber}/${totalBatches} completed successfully.`,
          );

          // Add a small delay between batches to avoid rate limiting
          if (batchNumber < totalBatches) {
            yield* Effect.sleep('1 second');
          }
        }),
    );

    console.log(`All ${pages.length} pages imported successfully.`);
  });
}

function importPages(project: string, pages: ImportPage[], sid: string) {
  return Effect.tryPromise({
    try: async () => {
      // Get CSRF token
      const profileResult = await getProfile({ sid });
      if (!profileResult.ok) {
        throw new Error('Failed to get CSRF token');
      }

      // Create FormData and send request
      const formData = new FormData();
      formData.append(
        'import-file',
        new Blob([JSON.stringify({ pages })], {
          type: 'application/octet-stream',
        }),
        'import.json',
      );
      formData.append('name', 'undefined');

      const response = await fetch(
        `https://scrapbox.io/api/page-data/import/${project}.json`,
        {
          method: 'POST',
          headers: {
            Cookie: `connect.sid=${sid}`,
            'X-CSRF-TOKEN': profileResult.val.csrfToken,
            Accept: 'application/json, text/plain, */*',
          },
          body: formData,
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Import failed: ${response.status} - ${errorBody}`);
      }
    },
    catch: error => ({
      _tag: 'ImportError' as const,
      message:
        error instanceof Error ? error.message : 'Failed to import pages',
      project,
    }),
  });
}

export function exportPagesFromProject(project: string, sid: string) {
  return Effect.tryPromise({
    try: async () => {
      console.log(`Exporting a json file from "/${project}"...`);

      const result = await exportPages(project, {
        sid,
        metadata: true,
      });

      if (!result.ok) {
        console.log(result);
        throw new Error(result.err.message);
      }

      return result.val.pages;
    },
    catch: error => ({
      _tag: 'ExportError' as const,
      message:
        error instanceof Error ? error.message : 'Failed to export pages',
      project,
    }),
  });
}

function processBatchesEffect<T, E, R>(
  items: T[],
  batchSize: number,
  processFunc: (
    batch: T[],
    batchNumber: number,
    totalBatches: number,
  ) => Effect.Effect<void, E, R>,
): Effect.Effect<void, E, R> {
  const batches = Array.from(
    { length: Math.ceil(items.length / batchSize) },
    (_, i) => items.slice(i * batchSize, (i + 1) * batchSize),
  );

  return Effect.gen(function* () {
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (batch) {
        yield* processFunc(batch, i + 1, batches.length);
      }
    }
  });
}
