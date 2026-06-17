const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const CRYPTO_VERSION = 'pending_signup_pii_v1';
const ENCRYPTION_ENV = 'PENDING_SIGNUP_ENCRYPTION_KEY_B64';
const HMAC_ENV = 'PENDING_SIGNUP_HMAC_KEY_B64';

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function getSecret(name: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[name]?.trim();
  if (!value) throw new Error(`${name}_missing`);
  return value;
}

async function getEncryptionKey(usages: KeyUsage[] = ['encrypt']): Promise<CryptoKey> {
  const bytes = base64ToBytes(getSecret(ENCRYPTION_ENV));
  if (bytes.byteLength !== 32) throw new Error(`${ENCRYPTION_ENV}_invalid_length`);
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, usages);
}

async function getHmacKey(): Promise<CryptoKey> {
  const encryptionBytes = base64ToBytes(getSecret(ENCRYPTION_ENV));
  const bytes = base64ToBytes(getSecret(HMAC_ENV));
  if (bytes.byteLength < 32) throw new Error(`${HMAC_ENV}_too_short`);
  if (encryptionBytes.byteLength === bytes.byteLength && encryptionBytes.every((byte, index) => byte === bytes[index])) {
    throw new Error('pending_signup_pii_keys_must_differ');
  }
  return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

function normalizePii(field: string, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFKC').replace(/[\r\n\t]+/g, ' ').trim();
  if (!normalized) return null;
  return field === 'email' ? normalized.toLowerCase() : normalized;
}

async function protectField(field: string, value: unknown) {
  const normalized = normalizePii(field, value);
  if (!normalized) return { encrypted: null, hmac: null };
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await getEncryptionKey(['encrypt']),
    TEXT_ENCODER.encode(normalized),
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    await getHmacKey(),
    TEXT_ENCODER.encode(`${field}:${normalized}`),
  );
  return {
    encrypted: JSON.stringify({ v: CRYPTO_VERSION, alg: 'AES-GCM', iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ciphertext)) }),
    hmac: bytesToBase64(new Uint8Array(signature)),
  };
}

export async function protectPendingSignupPii(values: Record<string, unknown>) {
  const email = await protectField('email', values.email);
  const firstName = await protectField('first_name', values.first_name);
  const lastName = await protectField('last_name', values.last_name);
  const phone = await protectField('phone', values.phone);
  const businessName = await protectField('business_name', values.business_name);
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

async function verifyFieldHmac(field: string, plaintext: string, expectedHmac: unknown): Promise<void> {
  if (typeof expectedHmac !== 'string' || !expectedHmac.trim()) throw new Error(`${field}_hmac_missing`);
  const signature = await crypto.subtle.sign(
    'HMAC',
    await getHmacKey(),
    TEXT_ENCODER.encode(`${field}:${plaintext}`),
  );
  const actual = bytesToBase64(new Uint8Array(signature));
  if (actual !== expectedHmac) throw new Error(`${field}_hmac_mismatch`);
}

async function unprotectField(field: string, encrypted: unknown, hmac: unknown): Promise<string> {
  if (typeof encrypted !== 'string' || !encrypted.trim()) throw new Error(`${field}_encrypted_missing`);
  const payload = JSON.parse(encrypted) as { v?: unknown; alg?: unknown; iv?: unknown; ct?: unknown };
  if (payload.v !== CRYPTO_VERSION || payload.alg !== 'AES-GCM' || typeof payload.iv !== 'string' || typeof payload.ct !== 'string') {
    throw new Error(`${field}_encrypted_invalid`);
  }

  const plaintextBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
    await getEncryptionKey(['decrypt']),
    base64ToBytes(payload.ct),
  );
  const plaintext = TEXT_DECODER.decode(plaintextBytes).trim();
  if (!plaintext) throw new Error(`${field}_plaintext_missing`);
  await verifyFieldHmac(field, plaintext, hmac);
  return plaintext;
}

export async function unprotectPendingSignupPii(values: Record<string, unknown>) {
  return {
    email: await unprotectField('email', values.email_encrypted, values.email_hmac),
    first_name: await unprotectField('first_name', values.first_name_encrypted, values.first_name_hmac),
    last_name: await unprotectField('last_name', values.last_name_encrypted, values.last_name_hmac),
    phone: await unprotectField('phone', values.phone_encrypted, values.phone_hmac),
    business_name: await unprotectField('business_name', values.business_name_encrypted, values.business_name_hmac),
  };
}
