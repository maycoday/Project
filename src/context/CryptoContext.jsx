import { createContext, useContext, useState, useEffect } from 'react';
import { generateSessionKey } from '@lib/crypto/aesEngine';
import { generateKeyPair, exportPublicKey } from '@lib/crypto/rsaWrapper';

const CryptoContext = createContext(null);

/**
 * Provides crypto primitives to the entire app.
 * Generates authority keypairs on mount and manages session keys.
 */
export function CryptoProvider({ children }) {
  const [cryptoState, setCryptoState] = useState({
    initialized: false,
    sessionKey: null,
    authorityKeys: {}, // { HR: { publicKey, privateKey, publicKeyB64 }, ... }
  });

  useEffect(() => {
    async function initCrypto() {
      try {
        // Generate AES session key
        const sessionKey = await generateSessionKey();

        // Generate RSA keypairs for each authority
        const authorities = ['HR', 'ICC', 'NGO'];
        const authorityKeys = {};

        for (const auth of authorities) {
          const keyPair = await generateKeyPair();
          const publicKeyB64 = await exportPublicKey(keyPair.publicKey);
          authorityKeys[auth] = {
            publicKey: keyPair.publicKey,
            privateKey: keyPair.privateKey,
            publicKeyB64,
          };
        }

        setCryptoState({
          initialized: true,
          sessionKey,
          authorityKeys,
        });

        console.log('[CryptoProvider] Crypto engine initialized — keys in memory only');
      } catch (err) {
        console.error('[CryptoProvider] Failed to initialize:', err);
      }
    }

    initCrypto();
  }, []);

  return (
    <CryptoContext.Provider value={cryptoState}>
      {children}
    </CryptoContext.Provider>
  );
}

export function useCrypto() {
  const ctx = useContext(CryptoContext);
  if (!ctx) throw new Error('useCrypto must be used within CryptoProvider');
  return ctx;
}
