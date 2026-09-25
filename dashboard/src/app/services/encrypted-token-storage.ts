// Encrypted Token Storage - Security enhancement against XSS attacks
// Uses Web Crypto API (AES-GCM) to encrypt tokens before storing in localStorage
// The encryption key is stored in memory (NOT in localStorage) for protection

/**
 * Encryption key stored in memory - NOT in localStorage
 * This ensures tokens cannot be decrypted even if XSS attacker gains access to localStorage
 */
let encryptionKey: CryptoKey | null = null;

/**
 * Initialize the encryption key
 * Called once on app startup
 */
export async function initEncryption(): Promise<void> {
  if (encryptionKey) {
    return; // Already initialized
  }

  // Generate a new AES-GCM key each session
  encryptionKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a token using AES-GCM
 * @param token - The plain text token to encrypt
 * @returns - Base64 encoded encrypted token (IV + ciphertext)
 */
export async function encryptToken(token: string): Promise<string> {
  if (!encryptionKey) {
    await initEncryption();
  }

  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM
  const encoder = new TextEncoder();
  const encodedToken = encoder.encode(token);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encryptionKey!,
    encodedToken
  );

  // Combine IV and ciphertext, then base64 encode
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt an encrypted token
 * @param encryptedToken - Base64 encoded encrypted token (IV + ciphertext)
 * @returns - Decrypted plain text token
 */
export async function decryptToken(encryptedToken: string): Promise<string> {
  if (!encryptionKey) {
    throw new Error('Encryption not initialized. Call initEncryption() first.');
  }

  // Decode base64
  const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));

  // Extract IV and ciphertext
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    encryptionKey!,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Check if encryption is available
 */
export function isEncryptionReady(): boolean {
  return encryptionKey !== null;
}