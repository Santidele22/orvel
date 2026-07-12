import assert from "node:assert/strict";
import test from "node:test";
import { retrieveServiceRoleAndInvoke } from "./trial-reminder-invoke-once.mjs";

const syntheticKey = `synthetic-${crypto.randomUUID()}`;

test("retrieves key in memory and performs exactly one sanitized invocation", async () => {
  const cliCalls = [];
  const fetchCalls = [];
  const stdout = [];
  const stderr = [];
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  process.stdout.write = (chunk) => { stdout.push(String(chunk)); return true; };
  process.stderr.write = (chunk) => { stderr.push(String(chunk)); return true; };
  let result;
  try {
    result = await retrieveServiceRoleAndInvoke({
      projectRef: "synthetic-linked-project",
      assertCoreDumpsDisabled: async () => true,
      runCli: async (args) => {
        cliCalls.push(args);
        return JSON.stringify([
          { name: "anon", api_key: "synthetic-anon-key" },
          { name: "service_role", api_key: syntheticKey },
          { name: "publishable", api_key: "synthetic-publishable-key" },
          { name: "secret", api_key: "synthetic-secret-key" },
        ]);
      },
      fetcher: async (input, init) => {
        fetchCalls.push({ input, init });
        return new Response('{"state":"sent"}', { status: 200 });
      },
    });
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  }

  assert.equal(result.status, 200);
  assert.equal(cliCalls.length, 1);
  assert.deepEqual(cliCalls[0], ["projects", "api-keys", "--project-ref", "synthetic-linked-project", "--output", "json"]);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].input, "https://synthetic-linked-project.supabase.co/functions/v1/send-trial-user-activation-reminder-once");
  assert.equal(fetchCalls[0].init.method, "POST");
  assert.equal(fetchCalls[0].init.body, "{}");
  assert.equal(fetchCalls[0].init.headers.authorization, `Bearer ${syntheticKey}`);
  assert.equal(JSON.stringify(cliCalls).includes(syntheticKey), false);
  assert.equal(JSON.stringify(result).includes(syntheticKey), false);
  assert.equal(stdout.join("").includes(syntheticKey), false);
  assert.equal(stderr.join("").includes(syntheticKey), false);
});

test("does not retry invocation after fetch failure", async () => {
  let fetches = 0;
  await assert.rejects(() => retrieveServiceRoleAndInvoke({
    projectRef: "synthetic-linked-project",
    assertCoreDumpsDisabled: async () => true,
    runCli: async () => JSON.stringify([{ name: "service_role", api_key: syntheticKey }]),
    fetcher: async () => {
      fetches += 1;
      throw new TypeError("transport failed");
    },
  }), /invocation outcome unknown/);
  assert.equal(fetches, 1);
});

test("fails before API-key retrieval when core dumps are not disabled", async () => {
  let cliCalls = 0;
  await assert.rejects(() => retrieveServiceRoleAndInvoke({
    projectRef: "synthetic-linked-project",
    assertCoreDumpsDisabled: async () => false,
    runCli: async () => { cliCalls += 1; return "[]"; },
    fetcher: async () => new Response(),
  }), /invocation outcome unknown/);
  assert.equal(cliCalls, 0);
});

test("strictly rejects malformed or ambiguous API-key schemas", async () => {
  const invalid = [
    [],
    [{ name: "anon", api_key: "anon-key" }],
    [{ name: "service_role", api_key: "" }],
    [{ name: "service_role", api_key: 42 }],
    [{ name: "service_role", key: syntheticKey }],
    [{ name: "service_role", value: syntheticKey }],
    [{ name: "service_role", api_key: syntheticKey }, { name: "service_role", api_key: "duplicate" }],
    [{ name: "service_role", api_key: syntheticKey }, { name: "unknown_role", api_key: "unknown" }],
    [{ name: "service_role", api_key: syntheticKey, unexpected: "field" }],
    [{ name: "service_role", api_key: syntheticKey }, { name: "anon", key: "alternate" }],
    [{ name: "service_role", api_key: syntheticKey }, { name: "anon", api_key: "one" }, { name: "anon", api_key: "two" }],
    { name: "service_role", api_key: syntheticKey },
    "not-json",
  ];
  for (const payload of invalid) {
    let fetches = 0;
    await assert.rejects(() => retrieveServiceRoleAndInvoke({
      projectRef: "synthetic-linked-project",
      assertCoreDumpsDisabled: async () => true,
      runCli: async () => typeof payload === "string" ? payload : JSON.stringify(payload),
      fetcher: async () => { fetches += 1; return new Response(); },
    }), /invocation outcome unknown/);
    assert.equal(fetches, 0);
  }
});
