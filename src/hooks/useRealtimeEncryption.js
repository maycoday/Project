import { useState, useCallback, useRef } from 'react';
import { encrypt, bufferToBase64 } from '@lib/crypto/aesEngine';
import { sha256 } from '@lib/crypto/hashUtils';
import { useCrypto } from '@context/CryptoContext';

/**
 * Hook for real-time encryption as user types.
 * Debounces encryption to avoid excessive crypto operations.
 */
export function useRealtimeEncryption() {
  const { sessionKey } = useCrypto();
  const [encryptedPreview, setEncryptedPreview] = useState('');
  const [complaintHash, setComplaintHash] = useState('');
  const [isEncrypting, setIsEncrypting] = useState(false);
  const debounceRef = useRef(null);

  const encryptText = useCallback(async (plaintext) => {
    if (!sessionKey || !plaintext.trim()) {
      setEncryptedPreview('');
      setComplaintHash('');
      return;
    }

    // Debounce encryption (150ms)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    debounceRef.current = setTimeout(async () => {
      setIsEncrypting(true);
      try {
        // Encrypt
        const { ciphertext, iv } = await encrypt(plaintext, sessionKey);
        const b64 = bufferToBase64(ciphertext);
        setEncryptedPreview(b64);

        // Generate complaint hash (digital signature)
        const hash = await sha256(plaintext);
        setComplaintHash(hash);
      } catch (err) {
        console.error('[Encryption] Failed:', err);
      } finally {
        setIsEncrypting(false);
      }
    }, 150);
  }, [sessionKey]);

  return {
    encryptText,
    encryptedPreview,
    complaintHash,
    isEncrypting,
  };
}
