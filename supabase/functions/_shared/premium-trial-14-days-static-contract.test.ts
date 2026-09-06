import { assert, assertStringIncludes } from "std/assert/mod.ts";

const migrationPath = new URL(
  "../../migrations/20260905210000_premium_trial_14_days.sql",
  import.meta.url,
);

Deno.test("premium trial migration starts a 14-day trial and expires lazily to FREE", async () => {
  const sql = await Deno.readTextFile(migrationPath);

  assertStringIncludes(sql, "premium_trial_used_at");
  assertStringIncludes(sql, "start_premium_trial");
  assertStringIncludes(sql, "interval '14 days'");
  assertStringIncludes(sql, "get_business_entitlements_snapshot");
  assertStringIncludes(sql, "trialing");
  assertStringIncludes(sql, "'FREE'");
  assert(
    /current_period_end\s*<=\s*now\(\)/i.test(sql),
    "expired trials must fall back when current_period_end <= now()",
  );
  assert(
    /trial_already_used/i.test(sql),
    "second-trial refusal must expose a trial_already_used outcome",
  );
});
