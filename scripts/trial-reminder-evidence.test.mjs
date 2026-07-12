import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { initializeEvidence, recordEvidence } from "./trial-reminder-evidence.mjs";

test("evidence persists only sanitized allowlisted operational fields", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "reminder-evidence-")), "evidence.json");
  await recordEvidence(path, {
    migration_alignment: "aligned",
    zero_attempt: true,
    temporary_function_count: 1,
    temporary_secret_count: 2,
    safe_preflight_status: 405,
    invocation_http_status: 200,
    durable_state: "sent",
    cleanup_status: "verified",
  });
  const raw = await readFile(path, "utf8");
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), [
    "cleanup_status", "durable_state", "invocation_http_status", "migration_alignment",
    "safe_preflight_status", "temporary_function_count", "temporary_secret_count", "zero_attempt",
  ]);
  assert.doesNotMatch(raw, /email|recipient|token|api_key|authorization|project_ref|body/i);
});

test("evidence rejects sensitive or invalid fields", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "reminder-evidence-")), "evidence.json");
  await assert.rejects(() => recordEvidence(path, { recipient_email: "x@example.invalid" }), /invalid evidence/);
  await assert.rejects(() => recordEvidence(path, { durable_state: "unknown" }), /invalid evidence/);
});

test("new operation evidence truncates stale terminal fields", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "reminder-evidence-")), "evidence.json");
  await recordEvidence(path, { invocation_http_status: 200, durable_state: "sent", cleanup_status: "verified" });
  await initializeEvidence(path, {
    operationId: "00000000-0000-4000-8000-000000000001",
    startedAt: "2026-07-11T12:00:00.000Z",
  });
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
    operation_id: "00000000-0000-4000-8000-000000000001",
    started_at: "2026-07-11T12:00:00.000Z",
  });
});
