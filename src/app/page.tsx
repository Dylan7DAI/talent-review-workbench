import { readFile } from "node:fs/promises";
import { defaultMarkdown } from "../lib/default-data";
import { restoreSnapshot } from "../lib/batch";
import Workbench from "../components/Workbench";
export default async function Page() {
  const markdown = await defaultMarkdown();
  let verified = null;
  try {
    verified = restoreSnapshot(
      JSON.parse(await readFile("src/data/verified-snapshot.json", "utf8")),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return <Workbench builtin={markdown} verified={verified} />;
}
