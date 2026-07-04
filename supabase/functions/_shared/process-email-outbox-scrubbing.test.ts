import { assertEquals, assertExists, assertMatch } from "std/assert/mod.ts";

import { scrubTokenBearingOutboxPayload } from "./process-email-outbox-helpers.ts";

Deno.test("sent outbox payload scrubbing removes nested relative token-bearing manage links", () => {
  const scrubbed = scrubTokenBearingOutboxPayload({
    subject: "Turno confirmado",
    links: {
      view: "/booking/manage?token=secret-token",
      cancel: "/booking/manage?action=cancel&token=secret-token",
      safe: "/booking/manage",
      token: "nested-opaque-token",
      manage_token: "nested-manage-token",
    },
    actions: [
      { href: "/booking/manage?token=array-token", token: "array-opaque-token" },
      { href: "/booking/manage?action=reschedule" },
    ],
    metadata: {
      manage_token: "metadata-manage-token",
      access_token: "metadata-access-token",
      label: "safe metadata",
    },
    confirmation_url: "https://orvel.pro/auth/signup/confirm-email?token=secret-token",
  });

  assertEquals(scrubbed.links.view, null);
  assertEquals(scrubbed.links.cancel, null);
  assertEquals(scrubbed.links.safe, "/booking/manage");
  assertEquals(scrubbed.links.token, null);
  assertEquals(scrubbed.links.manage_token, null);
  assertEquals(scrubbed.actions[0].href, null);
  assertEquals(scrubbed.actions[0].token, null);
  assertEquals(scrubbed.actions[1].href, "/booking/manage?action=reschedule");
  assertEquals(scrubbed.metadata.manage_token, null);
  assertEquals(scrubbed.metadata.access_token, null);
  assertEquals(scrubbed.metadata.label, "safe metadata");
  assertEquals(scrubbed.confirmation_url, null);
  assertExists(scrubbed.sensitive_payload_scrubbed_at);
  assertMatch(scrubbed.sensitive_payload_scrubbed_at, /^\d{4}-\d{2}-\d{2}T/);
});
