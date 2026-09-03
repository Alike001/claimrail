import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const workspace = new URL("..", import.meta.url).pathname;
const container = `claimrail-postgres-test-${process.pid}`;
const image = process.env.CLAIMRAIL_TEST_POSTGRES_IMAGE ?? "postgres:17-alpine";

function docker(args, options = {}) {
  return spawnSync("docker", args, {
    cwd: workspace,
    encoding: "utf8",
    ...options,
  });
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = docker(["exec", container, "pg_isready", "-U", "claimrail", "-d", "claimrail"]);
    if (ready.status === 0) return;
    await delay(500);
  }
  throw new Error("ephemeral PostgreSQL did not become ready");
}

function test(databaseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        "--config",
        "vitest.integration.config.ts",
        "packages/db/src/repositories/persistence.integration.test.ts",
      ],
      {
        cwd: workspace,
        stdio: "inherit",
        env: { ...process.env, TEST_DATABASE_URL: databaseUrl },
      },
    );
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`PostgreSQL integration tests failed (${signal ?? `exit ${code}`})`));
    });
  });
}

async function main() {
  const started = docker(
    [
      "run",
      "--rm",
      "-d",
      "--name",
      container,
      "-e",
      "POSTGRES_USER=claimrail",
      "-e",
      "POSTGRES_PASSWORD=claimrail",
      "-e",
      "POSTGRES_DB=claimrail",
      "-p",
      "127.0.0.1::5432",
      image,
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  if (started.status !== 0) throw new Error("could not start ephemeral PostgreSQL");
  try {
    await waitUntilReady();
    const portResult = docker(["port", container, "5432/tcp"]);
    if (portResult.status !== 0) throw new Error("could not resolve ephemeral PostgreSQL port");
    const port = portResult.stdout.trim().match(/:(\d+)$/)?.[1];
    if (port === undefined) throw new Error("ephemeral PostgreSQL returned an invalid port");
    await test(`postgresql://claimrail:claimrail@127.0.0.1:${port}/claimrail`);
  } finally {
    docker(["stop", "--time", "1", container], { stdio: "ignore" });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
