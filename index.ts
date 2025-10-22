import { Effect, Config } from 'effect';
import { exportPagesFromProject, importPagesToProject } from './pages';

type Page = {
  title: string;
  lines: {
    text: string;
    created: number;
    updated: number;
  }[];
  updated: number;
};

const LAST_IMPORT_FILE = 'last_import.txt';
const INITIAL_IMPORT_TIME = 1745842021;

if (import.meta.path === Bun.main) {
  await main();
}

// TODO: use runtime
async function main() {
  await Effect.runPromise(
    mainEffect().pipe(
      Effect.catchAll(error =>
        Effect.sync(() => {
          console.error('Error:', error);
          process.exit(1);
        }),
      ),
    ),
  );
}

function mainEffect() {
  return Effect.gen(function* () {
    const config = yield* getConfigEffect();
    const pages = yield* exportPagesFromProject(
      config.exportingProjectName,
      config.sid,
    );
    const filteredPages = filterPrivateIconPages(pages);
    const lastImportTime = yield* getLastImportTimeEffect();
    const newPages = filteredPages.filter(p => p.updated > lastImportTime);

    if (newPages.length === 0) {
      console.log('No new pages to import.');
      return;
    }

    console.log(`Found ${newPages.length} new or updated pages to import.`);
    console.log(newPages.map(p => p.title));

    yield* importPagesToProject(
      config.importingProjectName,
      newPages,
      config.sid,
    );
    yield* saveLastImportTimeEffect(Math.max(...newPages.map(p => p.updated)));
  });
}

function getConfigEffect() {
  return Effect.gen(function* () {
    const sid = yield* Config.string('SID');
    const exportingProjectName = yield* Config.string('SOURCE_PROJECT_NAME');
    const importingProjectName = yield* Config.string(
      'DESTINATION_PROJECT_NAME',
    );

    return {
      sid,
      exportingProjectName,
      importingProjectName,
    };
  });
}

function filterPrivateIconPages(pages: Page[]): Page[] {
  return pages.filter(p => !isIncludedIcon('[private.icon]')(p.lines));
}

function isIncludedIcon(icon: `[${string}.icon]`) {
  return (lines: { text: string }[]) =>
    lines.some(line => line.text.includes(icon));
}

function getLastImportTimeEffect() {
  return Effect.tryPromise({
    try: async () => {
      const file = Bun.file(LAST_IMPORT_FILE);
      const content = await file.text();
      return parseInt(content, 10);
    },
    catch: error => ({
      _tag: 'FileReadError' as const,
      message: error instanceof Error ? error.message : 'Failed to read file',
      path: LAST_IMPORT_FILE,
    }),
  }).pipe(
    Effect.catchAll(() =>
      saveLastImportTimeEffect(INITIAL_IMPORT_TIME).pipe(
        Effect.map(() => INITIAL_IMPORT_TIME),
      ),
    ),
  );
}

function saveLastImportTimeEffect(time: number) {
  return Effect.tryPromise({
    try: () => Bun.write(LAST_IMPORT_FILE, time.toString()),
    catch: error => ({
      _tag: 'FileWriteError' as const,
      message: error instanceof Error ? error.message : 'Failed to write file',
      path: LAST_IMPORT_FILE,
    }),
  });
}
