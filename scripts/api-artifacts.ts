import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createClaimRailJsonSchemaBundle,
  createClaimRailOpenApiDocument,
} from "../packages/contracts/src/openapi.js";

const root = resolve(import.meta.dirname, "..");
const outputs = new Map<string, string>([
  [
    resolve(root, "docs/api/openapi.generated.json"),
    `${JSON.stringify(createClaimRailOpenApiDocument(), null, 2)}\n`,
  ],
  [
    resolve(root, "docs/api/json-schemas.generated.json"),
    `${JSON.stringify(createClaimRailJsonSchemaBundle(), null, 2)}\n`,
  ],
]);

if (process.argv.includes("--check")) {
  const drifted: string[] = [];
  for (const [path, expected] of outputs) {
    const actual = await readFile(path, "utf8").catch(() => "");
    if (actual !== expected) drifted.push(path.replace(`${root}/`, ""));
  }
  if (drifted.length > 0) {
    process.stderr.write(
      `Generated ClaimRail API artifacts are stale: ${drifted.join(", ")}\nRun pnpm api:generate.\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write("ClaimRail OpenAPI and JSON Schema artifacts match runtime contracts.\n");
  }
} else {
  for (const [path, contents] of outputs) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents, "utf8");
    process.stdout.write(`Generated ${path.replace(`${root}/`, "")}\n`);
  }
}
