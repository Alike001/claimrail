import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";

const coreRoot = new URL("../packages/core/", import.meta.url);
const coreSourceRoot = fileURLToPath(new URL("src", coreRoot));
const packageJson = JSON.parse(await readFile(new URL("package.json", coreRoot), "utf8"));
const runtimeDependencies = Object.keys(packageJson.dependencies ?? {});

if (runtimeDependencies.length > 0) {
  throw new Error(`@claimrail/core must remain dependency-free: ${runtimeDependencies.join(", ")}`);
}

const forbiddenImports = [
  "@somnia-chain/",
  "@claimrail/db",
  "@claimrail/dreamdex",
  "drizzle-orm",
  "next",
  "react",
  "viem",
  "wagmi",
];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : [path];
    }),
  );
  return nested.flat().filter((path) => [".ts", ".tsx"].includes(extname(path)));
}

for (const file of await sourceFiles(coreSourceRoot)) {
  const source = await readFile(file, "utf8");
  for (const dependency of forbiddenImports) {
    if (source.includes(`from "${dependency}`) || source.includes(`from '${dependency}`)) {
      throw new Error(`${file} crosses the core dependency boundary through ${dependency}`);
    }
  }
}

process.stdout.write("ClaimRail core dependency boundary verified.\n");
