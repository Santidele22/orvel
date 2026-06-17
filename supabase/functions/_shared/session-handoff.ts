const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const HANDOFF_BYTES = 32;
const AES_GCM_IV_BYTES = 12;
const DEFAULT_TTL_MS = 2 * 60 * 1000;
const ENCRYPTION_ENV = "SESSION_HANDOFF_ENCRYPTION_KEY_B64";

export type SessionHandoffTokens = {
  access_token: string;
  refresh_token: string;
};

export type CreateSessionHandoffInput = {
  authorization: string | null;
  body: Record<string, unknown>;
  now?: number;
  ttlMs?: number;
  repository?: SessionHandoffRepository;
  encryptionKeyB64?: string;
};

export type RedeemSessionHandoffInput = {
  handoff: string;
  now?: number;
  repository?: SessionHandoffRepository;
  encryptionKeyB64?: string;
};

type EncryptedPayload = {
  v: "session_handoff_v1";
  alg: "AES-GCM";
  iv: string;
  ct: string;
};

export type StoredSessionHandoff = {
  handoff_hash: string;
  encrypted_session: EncryptedPayload;
  expires_at: string;
};

export interface SessionHandoffRepository {
  create(record: StoredSessionHandoff): Promise<void>;
  redeem(hash: string, nowIso: string): Promise<StoredSessionHandoff>;
}

const inMemoryHandoffs = new Map<string, StoredSessionHandoff & { redeemed_at?: string }>();
let ephemeralTestKey: Uint8Array | null = null;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", TEXT_ENCODER.encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createOpaqueHandoff(): string {
  const bytes = new Uint8Array(HANDOFF_BYTES);
  crypto.getRandomValues(bytes);
  return `handoff_${bytesToBase64Url(bytes)}`;
}

function getKeyBytes(explicitKeyB64?: string): Uint8Array {
  const configured = explicitKeyB64?.trim() || Deno.env.get(ENCRYPTION_ENV)?.trim();
  if (configured) {
    const bytes = base64ToBytes(configured);
    if (bytes.byteLength !== 32) throw new Error(`${ENCRYPTION_ENV}_invalid_length`);
    return bytes;
  }

  if (!ephemeralTestKey) {
    ephemeralTestKey = new Uint8Array(32);
    crypto.getRandomValues(ephemeralTestKey);
  }
  return ephemeralTestKey;
}

async function importAesKey(explicitKeyB64?: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", asArrayBufferBytes(getKeyBytes(explicitKeyB64)), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptSession(tokens: SessionHandoffTokens, explicitKeyB64?: string): Promise<EncryptedPayload> {
  const iv = new Uint8Array(AES_GCM_IV_BYTES);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await importAesKey(explicitKeyB64),
    TEXT_ENCODER.encode(JSON.stringify(tokens)),
  );
  return {
    v: "session_handoff_v1",
    alg: "AES-GCM",
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptSession(payload: EncryptedPayload, explicitKeyB64?: string): Promise<SessionHandoffTokens> {
  if (payload.v !== "session_handoff_v1" || payload.alg !== "AES-GCM") {
    throw new Error("invalid handoff payload");
  }
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asArrayBufferBytes(base64ToBytes(payload.iv)) },
    await importAesKey(explicitKeyB64),
    asArrayBufferBytes(base64ToBytes(payload.ct)),
  );
  const parsed = JSON.parse(TEXT_DECODER.decode(decrypted)) as Partial<SessionHandoffTokens>;
  if (typeof parsed.access_token !== "string" || typeof parsed.refresh_token !== "string") {
    throw new Error("invalid handoff session");
  }
  return { access_token: parsed.access_token, refresh_token: parsed.refresh_token };
}

function getBearerAccessToken(authorization: string | null): string {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) throw new Error("Authorization bearer token is required");
  return token;
}

function getRefreshToken(body: Record<string, unknown>): string {
  const refreshToken = body.refresh_token;
  if (typeof refreshToken !== "string" || !refreshToken.trim()) {
    throw new Error("refresh token is required");
  }
  return refreshToken.trim();
}

function getRepository(repository?: SessionHandoffRepository): SessionHandoffRepository {
  if (repository) return repository;
  return {
    async create(record) {
      inMemoryHandoffs.set(record.handoff_hash, record);
    },
    async redeem(hash, nowIso) {
      const record = inMemoryHandoffs.get(hash);
      if (!record) throw new Error("handoff not found");
      if (record.redeemed_at) throw new Error("already redeemed");
      if (new Date(record.expires_at).getTime() <= new Date(nowIso).getTime()) {
        throw new Error("handoff expired");
      }
      record.redeemed_at = nowIso;
      return record;
    },
  };
}

export async function createSessionHandoff(input: CreateSessionHandoffInput): Promise<{ handoff: string; expires_at: string }> {
  const accessToken = getBearerAccessToken(input.authorization);
  const refreshToken = getRefreshToken(input.body);
  const now = input.now ?? Date.now();
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  const handoff = createOpaqueHandoff();
  const handoffHash = await sha256Hex(handoff);
  const expiresAt = new Date(now + ttlMs).toISOString();

  await getRepository(input.repository).create({
    handoff_hash: handoffHash,
    encrypted_session: await encryptSession({ access_token: accessToken, refresh_token: refreshToken }, input.encryptionKeyB64),
    expires_at: expiresAt,
  });

  return { handoff, expires_at: expiresAt };
}

export async function redeemSessionHandoff(input: RedeemSessionHandoffInput): Promise<SessionHandoffTokens> {
  if (typeof input.handoff !== "string" || !input.handoff.trim()) throw new Error("handoff is required");
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const handoffHash = await sha256Hex(input.handoff.trim());
  const record = await getRepository(input.repository).redeem(handoffHash, nowIso);
  return decryptSession(record.encrypted_session, input.encryptionKeyB64);
}

type SupabaseLikeClient = {
  from(table: string): any;
};

function asArrayBufferBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

export function createSupabaseSessionHandoffRepository(supabase: SupabaseLikeClient): SessionHandoffRepository {
  return {
    async create(record) {
      const { error } = await supabase.from("session_handoffs").insert({
        handoff_hash: record.handoff_hash,
        encrypted_session: record.encrypted_session,
        expires_at: record.expires_at,
      });
      if (error) throw new Error("session handoff create failed");
    },
    async redeem(hash, nowIso) {
      const { data, error } = await supabase
        .from("session_handoffs")
        .update({ redeemed_at: nowIso })
        .eq("handoff_hash", hash)
        .is("redeemed_at", null)
        .gt("expires_at", nowIso)
        .select("handoff_hash, encrypted_session, expires_at")
        .maybeSingle();

      if (error) throw new Error("session handoff redeem failed");
      if (!data) throw new Error("handoff not found or already redeemed");
      return data as StoredSessionHandoff;
    },
  };
}

export function requireSessionHandoffEncryptionKey(): string {
  const value = Deno.env.get(ENCRYPTION_ENV)?.trim();
  if (!value) throw new Error(`${ENCRYPTION_ENV}_NOT_CONFIGURED`);
  if (base64ToBytes(value).byteLength !== 32) throw new Error(`${ENCRYPTION_ENV}_invalid_length`);
  return value;
}
