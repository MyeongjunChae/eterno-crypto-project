import { readFile } from "node:fs/promises";
import { recommendRoute } from "./advisor.mjs";

const quoteFile = process.argv[2];
if (!quoteFile) {
  console.error("Usage: node src/cli.mjs <fresh-provider-quotes.json>");
  process.exitCode = 2;
} else {
  try {
    const input = JSON.parse(await readFile(quoteFile, "utf8"));
    const recommendation = await recommendRoute(input);
    console.log(JSON.stringify(recommendation, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Route recommendation failed.");
    process.exitCode = 1;
  }
}
