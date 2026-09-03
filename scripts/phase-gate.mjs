const gate = process.argv[2] ?? "unknown";

const phases = {
  e2e: "Browser end-to-end tests begin with the read-only inbox in Phase 5.",
};

process.stdout.write(`${phases[gate] ?? `No implementation gate is configured for ${gate}.`}\n`);
