import { assertString, exportPages, importPages } from "./deps.ts";

type Config = {
  sid: string;
  exportingProjectName: string;
  importingProjectName: string;
}

type Page = {
  title: string;
  lines: { text: string }[];
}

if (import.meta.main) {
  await main();
}

async function main(): Promise<void> {
  try {
    const config = await getConfig();
    const pages = await exportPagesFromProject(config);
    const filteredPages = filterPrivateIconPages(pages);
    await importPagesToProject(config, filteredPages);
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

  console.log(`Importing ${pages.length} pages to "/${config.importingProjectName}"...`);

  const result = await importPages(config.importingProjectName, { pages }, { sid: config.sid });

  if (!result.ok) {
    const error = new Error();
    error.name = `${result.value.name} when importing pages`;
    error.message = result.value.message;
    throw error;
  }

  console.log(result.value);
}