type LogoutRouter = {
  navigateByUrl(url: string): Promise<boolean> | boolean;
};

type LogoutLocation = {
  assign(url: string): void;
};

export function isAbsoluteLogoutRedirect(redirectTo: string): boolean {
  try {
    const url = new URL(redirectTo);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isInAppLogoutSignIn(redirectTo: string): boolean {
  return (
    redirectTo.startsWith('/dashboard/login') ||
    redirectTo.startsWith('/auth/login') ||
    redirectTo.startsWith('/login')
  );
}

export async function navigateAfterLogout(
  redirectTo: string,
  router: LogoutRouter,
  location: LogoutLocation = window.location
): Promise<void> {
  if (isAbsoluteLogoutRedirect(redirectTo) || isInAppLogoutSignIn(redirectTo)) {
    location.assign(redirectTo);
    return;
  }

  await router.navigateByUrl(redirectTo);
}
