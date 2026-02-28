/**
 * AES-256-GCM Encryption Engine
 * 
 * Handles all symmetric encryption operations for the Aawaaz platform.
 * Uses Web Crypto API — keys never leave browser memory.
 * 
 * Security Architecture:
 * - AES-256-GCM provides authenticated encryption (confidentiality + integrity)
 * - 96-bit random IV per encryption (NIST recommended)
 * - Session keys generated per complaint (forward secrecy)
 * - Keys wrapped with RSA-OAEP before transmission
 */

const AES_ALGO = 'AES-GCM';
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits — NIST recommendation for GCM

/**
 * Generate a fresh AES-256-GCM session key
 * @returns {Promise<CryptoKey>} Ephemeral session key
 */
export async function generateSessionKey() {
  return crypto.subtle.generateKey(
    { name: AES_ALGO, length: AES_KEY_LENGTH },
    true, // extractable — needed for RSA wrapping
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt plaintext using AES-256-GCM
 * @param {string} plaintext - The complaint text to encrypt
 * @param {CryptoKey} key - AES session key
 * @returns {Promise<{ciphertext: ArrayBuffer, iv: Uint8Array}>}
 */
export async function encrypt(plaintext, key) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_ALGO, iv },
    key,
    encoder.encode(plaintext)
  );

  return { ciphertext, iv };
}

/**
 * Decrypt ciphertext using AES-256-GCM
 * @param {ArrayBuffer} ciphertext - Encrypted data
 * @param {CryptoKey} key - AES session key
 * @param {Uint8Array} iv - Initialization vector used during encryption
 * @returns {Promise<string>} Decrypted plaintext
 */
export async function decrypt(ciphertext, key, iv) {
  const decrypted = await crypto.subtle.decrypt(
    { name: AES_ALGO, iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Export AES key as raw bytes (for RSA wrapping)
 * @param {CryptoKey} key
 * @returns {Promise<ArrayBuffer>}
 */
export async function exportKey(key) {
  return crypto.subtle.exportKey('raw', key);
}

/**
 * Import raw AES key bytes
 * @param {ArrayBuffer} rawKey
 * @returns {Promise<CryptoKey>}
 */
export async function importKey(rawKey) {
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: AES_ALGO, length: AES_KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Convert ArrayBuffer to Base64 string
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 * @param {string} base64
 * @returns {ArrayBuffer}
 */
export function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
