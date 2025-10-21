import { assertString, exportPages, importPages } from "./deps.ts";

type Config = {
  sid: string;
  exportingProjectName: string;
  importingProjectName: string;
}

type Page = {
  title: string;
  lines: { text: string }[];
  updated: number;
}

const LAST_IMPORT_FILE = "last_import.txt";
const INITIAL_IMPORT_TIME = 1745842021;
const BATCH_SIZE = 100; // Number of pages to import per batch

if (import.meta.main) {
  await main();
}

async function main(): Promise<void> {
  try {
    const config = await getConfig();
    const pages = await exportPagesFromProject(config);
    const filteredPages = filterPrivateIconPages(pages);
    const lastImportTime = await getLastImportTime();
    const newPages = filteredPages.filter(p => p.updated > lastImportTime);

    if (newPages.length === 0) {
      console.log("No new pages to import.");
      return;
    }

    console.log(`Found ${newPages.length} new or updated pages to import.`);
    console.log(newPages.map(p => p.title));


    await importPagesToProject(config, newPages);
    await saveLastImportTime(Math.max(...newPages.map(p => p.updated)));
  } catch (error) {
    console.error("Error:", error);
    Deno.exit(1);
  }
}

async function getConfig(): Promise<Config> {
  const sid = Deno.env.get("SID");
  const exportingProjectName = Deno.env.get("SOURCE_PROJECT_NAME");
  const importingProjectName = Deno.env.get("DESTINATION_PROJECT_NAME");

  assertString(sid);
  assertString(exportingProjectName);
  assertString(importingProjectName);

  return {
    sid,
    exportingProjectName,
    importingProjectName
  }
}

async function exportPagesFromProject(config: Config): Promise<Page[]> {
  console.log(`Exporting a json file from "/${config.exportingProjectName}"...`);

  const result = await exportPages(config.exportingProjectName, {
    sid: config.sid,
    metadata: true,
  });

  if (!result.ok) {
    const error = new Error();
    error.name = `${result.value.name} when exporting a json file`;
    error.message = result.value.message;
    throw error;
  }

  return result.value.pages;
}

function filterPrivateIconPages(pages: Page[]): Page[] {
  return pages.filter(p => !isIncludedIcon("[private.icon]")(p.lines));
}

function isIncludedIcon(icon: `[${string}.icon]`) {
  return (lines: { text: string }[]) => lines.some((line) => line.text.includes(icon));
}

async function importPagesToProject(
  config: Config,
  pages: Page[],
): Promise<void> {
  if (pages.length === 0) {
    console.log("No page to be imported found.");
    return;
  }

  console.log(`Importing ${pages.length} pages to "/${config.importingProjectName}" in batches of ${BATCH_SIZE}...`);

  // Split pages into batches
  const batches = Array.from(
    { length: Math.ceil(pages.length / BATCH_SIZE) },
    (_, i) => pages.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
  );

  // Import each batch sequentially
  await batches.reduce(async (previousPromise, batch, index) => {
    await previousPromise;

    const batchNumber = index + 1;
    const totalBatches = batches.length;

    console.log(`Importing batch ${batchNumber}/${totalBatches} (${batch.length} pages)...`);

    const result = await importPages(config.importingProjectName, { pages: batch }, { sid: config.sid });

    if (!result.ok) {
      const error = new Error();
      return {
        ...error,
        name: `${result.value.name} when importing pages (batch ${batchNumber}/${totalBatches})`,
        message: result.value.message,
      }
    }

    console.log(`Batch ${batchNumber}/${totalBatches} completed successfully.`);

    // Add a small delay between batches to avoid rate limiting
    if (index < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }, Promise.resolve());

  console.log(`All ${pages.length} pages imported successfully.`);
}

async function getLastImportTime(): Promise<number> {
  try {
    const content = await Deno.readTextFile(LAST_IMPORT_FILE);
    return parseInt(content, 10);
  } catch {
    // 初回実行時は特定の日時を設定
    await saveLastImportTime(INITIAL_IMPORT_TIME);
    return INITIAL_IMPORT_TIME;
  }
}

async function saveLastImportTime(time: number): Promise<void> {
  await Deno.writeTextFile(LAST_IMPORT_FILE, time.toString());
}