/**
 * RSA-OAEP Key Wrapping Module
 * 
 * Handles asymmetric encryption for key wrapping in Aawaaz.
 * Each authority has an RSA-2048 keypair. The AES session key
 * is "wrapped" (encrypted) with each selected authority's public key.
 * Only the authority's private key can unwrap it.
 * 
 * Key Hierarchy:
 * [Complaint Plaintext] -> AES-256-GCM -> [Ciphertext]
 * [AES Session Key] -> RSA-OAEP(Authority_PubKey) -> [Wrapped Key]
 * 
 * Only authorities with the corresponding private key can recover
 * the AES session key and decrypt the complaint.
 */

const RSA_ALGO = 'RSA-OAEP';
const RSA_HASH = 'SHA-256';
const RSA_MOD_LENGTH = 2048;

/**
 * Generate an RSA-2048 keypair for an authority
 * @returns {Promise<CryptoKeyPair>} { publicKey, privateKey }
 */
export async function generateKeyPair() {
  return crypto.subtle.generateKey(
    {
      name: RSA_ALGO,
      modulusLength: RSA_MOD_LENGTH,
      publicExponent: new Uint8Array([1, 0, 1]), // 65537
      hash: RSA_HASH,
    },
    true,
    ['wrapKey', 'unwrapKey']
  );
}

/**
 * Wrap (encrypt) an AES key using an RSA public key
 * @param {CryptoKey} sessionKey - AES session key to wrap
 * @param {CryptoKey} publicKey - Authority's RSA public key
 * @returns {Promise<ArrayBuffer>} Wrapped key bytes
 */
export async function wrapKey(sessionKey, publicKey) {
  return crypto.subtle.wrapKey('raw', sessionKey, publicKey, { name: RSA_ALGO });
}

/**
 * Unwrap (decrypt) an AES key using an RSA private key
 * @param {ArrayBuffer} wrappedKey - The wrapped key bytes
 * @param {CryptoKey} privateKey - Authority's RSA private key
 * @returns {Promise<CryptoKey>} Recovered AES session key
 */
export async function unwrapKey(wrappedKey, privateKey) {
  return crypto.subtle.unwrapKey(
    'raw',
    wrappedKey,
    privateKey,
    { name: RSA_ALGO },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Export RSA public key as SPKI (for display / sharing)
 * @param {CryptoKey} publicKey
 * @returns {Promise<string>} Base64-encoded SPKI
 */
export async function exportPublicKey(publicKey) {
  const exported = await crypto.subtle.exportKey('spki', publicKey);
  const bytes = new Uint8Array(exported);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Export RSA private key as PKCS8 (for authority storage)
 * @param {CryptoKey} privateKey
 * @returns {Promise<string>} Base64-encoded PKCS8
 */
export async function exportPrivateKey(privateKey) {
  const exported = await crypto.subtle.exportKey('pkcs8', privateKey);
  const bytes = new Uint8Array(exported);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
