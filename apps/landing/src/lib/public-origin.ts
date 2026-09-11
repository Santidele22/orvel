export const MARKETING_ORIGIN = 'https://orvel.pro';
export const OG_SHARE_PATH = '/og-share.png';
export const OG_SHARE_URL = `${MARKETING_ORIGIN}${OG_SHARE_PATH}`;

export function marketingCanonicalUrl(pathname: string): string {
  const pathOnly = pathname.split('?')[0].split('#')[0].trim();
  const withLeadingSlash = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  if (withLeadingSlash === '/' || withLeadingSlash === '') {
    return `${MARKETING_ORIGIN}/`;
  }
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '');
  return `${MARKETING_ORIGIN}${withoutTrailingSlash}`;
}
