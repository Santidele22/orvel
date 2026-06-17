import { assertEquals, assertRejects } from "jsr:@std/assert";

import {
  createSessionHandoff,
  redeemSessionHandoff,
} from "./session-handoff.ts";

Deno.test("RED Contract: creates only opaque one-time handoff references", async () => {
  const handoff = await createSessionHandoff({
    authorization: "Bearer access.jwt.must.not.be.returned",
    body: { refresh_token: "refresh.jwt.must.not.be.returned" },
    now: 1_780_000_000_000,
  });

  assertEquals(typeof handoff.handoff, "string");
  assertEquals(handoff.handoff.includes("access.jwt"), false);
  assertEquals(handoff.handoff.includes("refresh.jwt"), false);
  assertEquals("access_token" in handoff, false);
  assertEquals("refresh_token" in handoff, false);
});

Deno.test("RED Contract: handoff redemption is single-use and returns session only on first POST redemption", async () => {
  const created = await createSessionHandoff({
    authorization: "Bearer access.jwt",
    body: { refresh_token: "refresh.jwt" },
    now: 1_780_000_000_000,
  });

  const first = await redeemSessionHandoff({ handoff: created.handoff, now: 1_780_000_000_100 });
  assertEquals(first, {
    access_token: "access.jwt",
    refresh_token: "refresh.jwt",
  });

  await assertRejects(
    () => redeemSessionHandoff({ handoff: created.handoff, now: 1_780_000_000_200 }),
    Error,
    "already redeemed",
  );
});

Deno.test("RED Contract: create handoff rejects missing bearer or refresh body", async () => {
  await assertRejects(
    () => createSessionHandoff({ authorization: null, body: { refresh_token: "refresh.jwt" } }),
    Error,
    "Authorization",
  );

  await assertRejects(
    () => createSessionHandoff({ authorization: "Bearer access.jwt", body: {} }),
    Error,
    "refresh",
  );
});
