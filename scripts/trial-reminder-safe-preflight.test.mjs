import assert from "node:assert/strict";
import test from "node:test";
import { safePreflight } from "./trial-reminder-safe-preflight.mjs";

test("safe preflight performs exactly one headerless bodyless GET and accepts only 405", async () => {
  const calls = [];
  const result = await safePreflight({
    projectRef: "syntheticproject",
    timeoutMs: 50,
    fetcher: async (input, init) => { calls.push({ input, init }); return new Response("ignored", { status: 405 }); },
  });
  assert.deepEqual(result, { status: 405 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers, undefined);
  assert.equal(calls[0].init.body, undefined);
});

test("safe preflight rejects non-405, timeout and transport without retry", async () => {
  for (const scenario of ["401", "200", "timeout", "transport"]) {
    let calls = 0;
    await assert.rejects(() => safePreflight({
      projectRef: "syntheticproject",
      timeoutMs: 5,
      fetcher: async (_input, init) => {
        calls += 1;
        if (scenario === "timeout") return await new Promise((_r, reject) => init.signal.addEventListener("abort", () => reject(new Error("abort"))));
        if (scenario === "transport") throw new Error("network detail");
        return new Response("ignored", { status: Number(scenario) });
      },
    }), /safe preflight failed/);
    assert.equal(calls, 1);
  }
});
