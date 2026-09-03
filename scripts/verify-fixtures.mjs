import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const fixtureRoot = new URL("../fixtures/dreamdex/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", fixtureRoot), "utf8"));

if (manifest.policy.productionImportAllowed !== false) {
  throw new Error("DreamDEX evidence fixtures must never be marked for production imports.");
}

if (manifest.chain.chainId !== 50312 || manifest.adapter.dreamdexSdk !== "0.29.0") {
  throw new Error("Fixture chain or DreamDEX adapter version drifted from the Phase 0 capture.");
}

for (const fixture of manifest.fixtures) {
  const contents = await readFile(new URL(fixture.path, fixtureRoot));
  JSON.parse(contents.toString("utf8"));

  const actualSha256 = createHash("sha256").update(contents).digest("hex");
  if (actualSha256 !== fixture.sha256) {
    throw new Error(
      `Fixture checksum mismatch for ${fixture.path}: expected ${fixture.sha256}, received ${actualSha256}`,
    );
  }
}

process.stdout.write(
  `Verified ${manifest.fixtures.length} immutable DreamDEX evidence fixtures.\n`,
);
