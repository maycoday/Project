/**
 * SHA-256 Hashing Utilities
 * 
 * Used for:
 * - Complaint digital signatures (content hash)
 * - Tracking token hashing (token -> token_hash before DB storage)
 * - Merkle tree leaf hashing
 */

/**
 * SHA-256 hash of a string
 * @param {string} message
 * @returns {Promise<string>} Hex-encoded hash
 */
export async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
}

/**
 * SHA-256 hash of an ArrayBuffer
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>} Hex-encoded hash
 */
export async function sha256Buffer(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return bufferToHex(hashBuffer);
}

/**
 * Double SHA-256 (used for tracking tokens — extra security layer)
 * @param {string} message
 * @returns {Promise<string>}
 */
export async function doubleSha256(message) {
  const first = await sha256(message);
  return sha256(first);
}

/**
 * Convert ArrayBuffer to hex string
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
