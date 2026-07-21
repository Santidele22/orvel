import { chmod, readFile, rename, writeFile } from "node:fs/promises";

const validators = {
  operation_id: (v) => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v),
  started_at: (v) => typeof v === "string" && !Number.isNaN(Date.parse(v)),
  migration_alignment: (v) => v === "aligned",
  zero_attempt: (v) => typeof v === "boolean",
  temporary_function_count: (v) => Number.isInteger(v) && v >= 0 && v <= 1,
  temporary_secret_count: (v) => Number.isInteger(v) && v >= 0 && v <= 2,
  safe_preflight_status: (v) => v === 405,
  invocation_http_status: (v) => Number.isInteger(v) && v >= 100 && v <= 599,
  durable_state: (v) => ["reserved", "sent", "rejected", "ambiguous"].includes(v),
  cleanup_status: (v) => v === "verified",
};

async function replaceEvidence(path, value) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, path);
}

export async function initializeEvidence(path, { operationId = crypto.randomUUID(), startedAt = new Date().toISOString() } = {}) {
  const value = { operation_id: operationId, started_at: startedAt };
  if (!validators.operation_id(operationId) || !validators.started_at(startedAt)) throw new Error("invalid evidence");
  await replaceEvidence(path, value);
}

export async function recordEvidence(path, update) {
  for (const [key, value] of Object.entries(update)) {
    if (!Object.hasOwn(validators, key) || !validators[key](value)) throw new Error("invalid evidence");
  }
  let current = {};
  try { current = JSON.parse(await readFile(path, "utf8")); } catch (error) {
    if (error?.code !== "ENOENT") throw new Error("invalid evidence");
  }
  const next = { ...current, ...update };
  for (const [key, value] of Object.entries(next)) {
    if (!Object.hasOwn(validators, key) || !validators[key](value)) throw new Error("invalid evidence");
  }
  await replaceEvidence(path, next);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [path, key, serializedValue] = process.argv.slice(2);
  if (!path || !key) process.exit(2);
  try {
    if (key === "init") await initializeEvidence(path);
    else {
      if (serializedValue === undefined) process.exit(2);
      await recordEvidence(path, { [key]: JSON.parse(serializedValue) });
    }
  } catch {
    process.stderr.write("evidence_record_failed\n");
    process.exit(1);
  }
}
