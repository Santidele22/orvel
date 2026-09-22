/** Disposable sandbox-v1 tenants. Never target production. */

export const SANDBOX_SLUG_PREFIX = "sandbox-v1-";
export const SANDBOX_TENANT_COUNT = 100;
export const SANDBOX_HAMMER_TENANT_CONCURRENCY = 10;

export const SANDBOX_SIZE_CYCLE = [
  { label: "micro", professionals: 1, durationMinutes: 30 },
  { label: "micro", professionals: 1, durationMinutes: 30 },
  { label: "micro", professionals: 1, durationMinutes: 60 },
  { label: "small", professionals: 2, durationMinutes: 30 },
  { label: "small", professionals: 2, durationMinutes: 30 },
  { label: "small", professionals: 2, durationMinutes: 60 },
  { label: "mid", professionals: 3, durationMinutes: 30 },
  { label: "mid", professionals: 4, durationMinutes: 30 },
  { label: "peak", professionals: 5, durationMinutes: 30 },
  { label: "peak", professionals: 6, durationMinutes: 30 },
] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function pad3(value: number): string {
  return String(value).padStart(3, "0");
}

export const SANDBOX_TENANTS = Array.from({ length: SANDBOX_TENANT_COUNT }, (_, index) => {
  const n = index + 1;
  const size = SANDBOX_SIZE_CYCLE[index % SANDBOX_SIZE_CYCLE.length];
  return {
    n,
    slug: `${SANDBOX_SLUG_PREFIX}${size.label}-${pad3(n)}`,
    name: `Sandbox ${size.label} ${pad3(n)}`,
    professionals: size.professionals,
    durationMinutes: size.durationMinutes,
  };
});

export type SandboxTenant = (typeof SANDBOX_TENANTS)[number];

export function sandboxBusinessId(n: number): string {
  return `00000000-5a00-4000-a000-01${pad3(n)}0000000`;
}

export function sandboxServiceId(n: number): string {
  return `00000000-5a00-4000-a000-02${pad3(n)}0000000`;
}

export function sandboxProfessionalId(n: number, professionalIndex: number): string {
  return `00000000-5a00-4000-a000-03${pad3(n)}${pad2(professionalIndex)}00000`;
}

export const SANDBOX_WORKING_HOURS = {
  monday: { enabled: true, start: "09:00", end: "18:00" },
  tuesday: { enabled: true, start: "09:00", end: "18:00" },
  wednesday: { enabled: true, start: "09:00", end: "18:00" },
  thursday: { enabled: true, start: "09:00", end: "18:00" },
  friday: { enabled: true, start: "09:00", end: "18:00" },
  saturday: { enabled: true, start: "09:00", end: "18:00" },
  sunday: { enabled: false, start: "10:00", end: "14:00" },
} as const;

export function isDisposableSupabaseUrl(url: string, allowRemote = false): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host.includes("prod") || host.endsWith("orvel.pro")) return false;
  return allowRemote && host.endsWith(".supabase.co");
}

/** Next in-hours slot in America/Argentina/Buenos_Aires (UTC-3, no DST). */
export function nextSandboxSlotIso(from = new Date()): string {
  const candidate = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  candidate.setUTCMinutes(0, 0, 0);
  candidate.setUTCHours(13);
  const arWeekday = new Date(candidate.getTime() - 3 * 60 * 60 * 1000).getUTCDay();
  if (arWeekday === 0) candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate.toISOString();
}

export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let offset = 0; offset < items.length; offset += limit) {
    const chunk = items.slice(offset, offset + limit);
    results.push(...await Promise.all(chunk.map((item) => mapper(item))));
  }
  return results;
}
