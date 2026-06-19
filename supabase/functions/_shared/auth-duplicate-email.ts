type AuthUser = {
  id: string;
  email?: string | null;
};

type AuthAdminListUsersResult = {
  data: { users?: AuthUser[] | null } | null;
  error: unknown;
};

type AuthAdminClient = {
  auth: {
    admin: {
      listUsers: (params: { page: number; perPage: number }) => Promise<AuthAdminListUsersResult>;
    };
  };
};

const AUTH_USERS_PAGE_SIZE = 1000;
const AUTH_USERS_MAX_PAGES = 10;

export async function findAuthUserByEmail(
  supabaseAdmin: AuthAdminClient,
  email: string,
): Promise<{ user: AuthUser | null; error: unknown }> {
  const normalizedEmail = email.trim().toLowerCase();

  for (let page = 1; page <= AUTH_USERS_MAX_PAGES; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: AUTH_USERS_PAGE_SIZE,
    });

    if (error) {
      return { user: null, error };
    }

    const users = data?.users ?? [];
    const matchingUser = users.find((user) =>
      typeof user.email === "string" && user.email.trim().toLowerCase() === normalizedEmail
    );

    if (matchingUser) {
      return { user: matchingUser, error: null };
    }

    if (users.length < AUTH_USERS_PAGE_SIZE) {
      return { user: null, error: null };
    }
  }

  return {
    user: null,
    error: new Error("Auth Admin duplicate email lookup exceeded page limit"),
  };
}
