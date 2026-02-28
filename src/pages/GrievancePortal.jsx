import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, Eye, EyeOff, Hash, Send } from 'lucide-react';
import { useCrypto } from '@context/CryptoContext';
import { useRealtimeEncryption } from '@hooks/useRealtimeEncryption';
import { useComplaintStore } from '@stores/complaintStore';
import { sha256 } from '@lib/crypto/hashUtils';
import { truncateHash } from '@utils/helpers';

export default function GrievancePortal() {
  const { initialized, authorityKeys } = useCrypto();
  const { encryptText, encryptedPreview, complaintHash } = useRealtimeEncryption();
  const store = useComplaintStore();
  const [charCount, setCharCount] = useState(0);

  const handleTextChange = (e) => {
    const text = e.target.value;
    store.setPlaintext(text);
    setCharCount(text.length);
    encryptText(text);
  };

  if (!initialized) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-saffron/30 border-t-saffron rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-white/40 font-mono">Generating cryptographic keys...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="inline-flex items-center gap-2 bg-saffron/10 border border-saffron/25 rounded-full px-4 py-1.5 text-[10px] font-mono font-bold text-saffron tracking-wider mb-6">
          <Shield className="w-3 h-3" /> ZERO-KNOWLEDGE ARCHITECTURE
        </div>
        <h1 className="font-serif text-4xl font-light text-white/95 mb-4">
          Your Voice. <span className="text-gradient">Encrypted.</span>
        </h1>
        <p className="text-white/40 max-w-xl mx-auto">
          File a complaint with end-to-end encryption. No identity collected. 
          Only selected authorities can decrypt using their private keys.
        </p>
      </motion.div>

      {/* Complaint Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass p-6 mb-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white/80 flex items-center gap-2">
            <Lock className="w-4 h-4 text-saffron" /> Write Your Complaint
          </h2>
          <div className="flex items-center gap-2">
            {complaintHash && (
              <span className="text-[9px] font-mono text-white/30 bg-white/5 px-2 py-1 rounded">
                <Hash className="w-3 h-3 inline mr-1" />
                SHA-256: {truncateHash(complaintHash)}
              </span>
            )}
            <span className={`text-[10px] font-mono ${charCount > 5000 ? 'text-red-400' : 'text-white/30'}`}>
              {charCount}/5000
            </span>
          </div>
        </div>

        <textarea
          value={store.plaintext}
          onChange={handleTextChange}
          maxLength={5000}
          rows={6}
          placeholder="Describe your grievance in detail. This text is encrypted in real-time as you type..."
          className="w-full bg-white/5 border border-white/10 rounded-lg p-4 text-sm text-white/90 placeholder:text-white/20 resize-none focus:outline-none focus:border-saffron/40 transition-colors"
        />

        {/* Live encryption preview */}
        {encryptedPreview && (
          <div className="mt-4 p-3 bg-black/20 rounded-lg border border-white/5">
            <div className="text-[8px] font-mono text-saffron/60 uppercase tracking-wider mb-2">
              Live Ciphertext (AES-256-GCM)
            </div>
            <div className="text-[10px] font-mono text-white/20 break-all leading-relaxed max-h-20 overflow-hidden">
              {encryptedPreview.slice(0, 200)}...
            </div>
          </div>
        )}
      </motion.div>

      {/* Authority Selection */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass p-6 mb-6"
      >
        <h2 className="text-sm font-semibold text-white/80 mb-4">Select Receiving Authorities</h2>
        <div className="grid grid-cols-3 gap-3">
          {['HR', 'ICC', 'NGO'].map(code => {
            const selected = store.selectedAuthorities.includes(code);
            const labels = { HR: 'Human Resources', ICC: 'IC Committee', NGO: 'NGO Partner' };
            const icons = { HR: '🏢', ICC: '⚖️', NGO: '🌿' };
            return (
              <button
                key={code}
                onClick={() => store.toggleAuthority(code)}
                className={`p-4 rounded-lg border transition-all text-left ${
                  selected
                    ? 'bg-saffron/10 border-saffron/30 text-white'
                    : 'bg-white/3 border-white/10 text-white/50 hover:bg-white/5'
                }`}
              >
                <div className="text-lg mb-1">{icons[code]}</div>
                <div className="text-xs font-semibold">{labels[code]}</div>
                <div className="text-[9px] font-mono text-white/30 mt-1">
                  RSA-2048 · {truncateHash(authorityKeys[code]?.publicKeyB64 || '', 6)}
                </div>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Submit */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <button
          disabled={!store.plaintext.trim() || store.selectedAuthorities.length === 0 || store.isSubmitting}
          className="w-full py-4 rounded-lg bg-saffron text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-saffron/90 transition-all"
        >
          <Send className="w-4 h-4" />
          {store.isSubmitting ? 'Encrypting & Submitting...' : 'Submit Encrypted Complaint'}
        </button>
      </motion.div>
    </div>
  );
}
