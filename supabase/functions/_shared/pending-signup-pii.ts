const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const CRYPTO_VERSION = "pending_signup_pii_v1";
const ENCRYPTION_ENV = "PENDING_SIGNUP_ENCRYPTION_KEY_B64";
const HMAC_ENV = "PENDING_SIGNUP_HMAC_KEY_B64";

export type ProtectedPendingSignupField = {
  encrypted: string | null;
  hmac: string | null;
};

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function getRequiredKeyBytes(
  envName: string,
  options: { exactLength?: number; minLength?: number },
): Uint8Array<ArrayBuffer> {
  const raw = Deno.env.get(envName)?.trim();
  if (!raw) throw new Error(`${envName}_missing`);
  const bytes = base64ToBytes(raw);
  if (options.exactLength !== undefined && bytes.byteLength !== options.exactLength) {
    throw new Error(`${envName}_invalid_length`);
  }
  if (options.minLength !== undefined && bytes.byteLength < options.minLength) {
    throw new Error(`${envName}_too_short`);
  }
  return bytes;
}

function assertSeparateKeys(encryptionBytes: Uint8Array, hmacBytes: Uint8Array): void {
  if (encryptionBytes.byteLength !== hmacBytes.byteLength) return;
  const same = encryptionBytes.every((byte, index) => byte === hmacBytes[index]);
  if (same) throw new Error("pending_signup_pii_keys_must_differ");
}

async function getEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    getRequiredKeyBytes(ENCRYPTION_ENV, { exactLength: 32 }),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

async function getHmacKey(): Promise<CryptoKey> {
  const encryptionBytes = getRequiredKeyBytes(ENCRYPTION_ENV, { exactLength: 32 });
  const hmacBytes = getRequiredKeyBytes(HMAC_ENV, { minLength: 32 });
  assertSeparateKeys(encryptionBytes, hmacBytes);
  return crypto.subtle.importKey(
    "raw",
    hmacBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function signPendingSignupPii(field: string, normalized: string): Promise<Uint8Array<ArrayBuffer>> {
  const hmac = await crypto.subtle.sign(
    "HMAC",
    await getHmacKey(),
    TEXT_ENCODER.encode(`${field}:${normalized}`),
  );
  return new Uint8Array(hmac);
}

function timingSafeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export function normalizePendingSignupPii(field: string, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").replace(/[\r\n\t]+/g, " ").trim();
  if (!normalized) return null;
  if (field === "email") return normalized.toLowerCase();
  if (field === "phone") return normalized.replace(/\s+/g, " ");
  return normalized;
}

export async function protectPendingSignupPiiField(
  field: string,
  value: unknown,
): Promise<ProtectedPendingSignupField> {
  const normalized = normalizePendingSignupPii(field, value);
  if (!normalized) return { encrypted: null, hmac: null };

  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encryptionKey = await getEncryptionKey();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    TEXT_ENCODER.encode(normalized),
  );
  const hmac = await signPendingSignupPii(field, normalized);

  return {
    encrypted: JSON.stringify({
      v: CRYPTO_VERSION,
      alg: "AES-GCM",
      iv: bytesToBase64(iv),
      ct: bytesToBase64(new Uint8Array(encrypted)),
    }),
    hmac: bytesToBase64(hmac),
  };
}

export async function decryptPendingSignupPiiField(value: unknown): Promise<string | null> {
  if (typeof value !== "string" || !value.trim()) return null;
  const payload = JSON.parse(value) as { v?: string; iv?: string; ct?: string };
  if (payload.v !== CRYPTO_VERSION || !payload.iv || !payload.ct) {
    throw new Error("pending_signup_pii_payload_invalid");
  }
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
    await getEncryptionKey(),
    base64ToBytes(payload.ct),
  );
  return TEXT_DECODER.decode(decrypted);
}

export async function verifyPendingSignupPiiField(
  field: string,
  encryptedValue: unknown,
  expectedHmac: unknown,
): Promise<string | null> {
  if (typeof expectedHmac !== "string" || !expectedHmac.trim()) return null;
  const decrypted = await decryptPendingSignupPiiField(encryptedValue);
  if (!decrypted) return null;
  const normalized = normalizePendingSignupPii(field, decrypted);
  if (!normalized) return null;
  const actualHmac = await signPendingSignupPii(field, normalized);
  const expectedHmacBytes = base64ToBytes(expectedHmac);
  if (!timingSafeEqualBytes(actualHmac, expectedHmacBytes)) {
    throw new Error("pending_signup_pii_hmac_mismatch");
  }
  return normalized;
}

export async function protectPendingSignupPii(values: Record<string, unknown>) {
  const email = await protectPendingSignupPiiField("email", values.email);
  const firstName = await protectPendingSignupPiiField("first_name", values.first_name);
  const lastName = await protectPendingSignupPiiField("last_name", values.last_name);
  const phone = await protectPendingSignupPiiField("phone", values.phone);
  const businessName = await protectPendingSignupPiiField("business_name", values.business_name);

  return {
    email_encrypted: email.encrypted,
    email_hmac: email.hmac,
    first_name_encrypted: firstName.encrypted,
    first_name_hmac: firstName.hmac,
    last_name_encrypted: lastName.encrypted,
    last_name_hmac: lastName.hmac,
    phone_encrypted: phone.encrypted,
    phone_hmac: phone.hmac,
    business_name_encrypted: businessName.encrypted,
    business_name_hmac: businessName.hmac,
    pii_crypto_version: CRYPTO_VERSION,
  };
}
