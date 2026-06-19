import { assertEquals } from "std/assert/mod.ts";
import { findAuthUserByEmail } from "./auth-duplicate-email.ts";

Deno.test("findAuthUserByEmail uses supported Auth Admin listUsers pagination instead of auth.users PostgREST", async () => {
  const calls: Array<{ page: number; perPage: number }> = [];
  const supabaseAdmin = {
    auth: {
      admin: {
        listUsers: async (params: { page: number; perPage: number }) => {
          calls.push(params);
          return {
            data: {
              users: params.page === 1
                ? [
                  { id: "other-user", email: "other@example.com" },
                  { id: "duplicate-user", email: "Owner@Example.com" },
                ]
                : [],
            },
            error: null,
          };
        },
      },
    },
    schema() {
      throw new Error("auth.users PostgREST query must not be used");
    },
  };

  const result = await findAuthUserByEmail(supabaseAdmin, "owner@example.com");

  assertEquals(result, {
    user: { id: "duplicate-user", email: "Owner@Example.com" },
    error: null,
  });
  assertEquals(calls, [{ page: 1, perPage: 1000 }]);
});

Deno.test("findAuthUserByEmail returns Auth Admin errors for safe failure handling", async () => {
  const authError = { message: "Auth Admin unavailable" };
  const supabaseAdmin = {
    auth: {
      admin: {
        listUsers: async () => ({ data: null, error: authError }),
      },
    },
  };

  const result = await findAuthUserByEmail(supabaseAdmin, "owner@example.com");

  assertEquals(result, { user: null, error: authError });
});
