const TEXT_ENCODER = new TextEncoder();
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

async function getEncryptionKey(): Promise<CryptoKey> {
  const bytes = base64ToBytes(getSecret(ENCRYPTION_ENV));
  if (bytes.byteLength !== 32) throw new Error(`${ENCRYPTION_ENV}_invalid_length`);
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt']);
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
    await getEncryptionKey(),
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
