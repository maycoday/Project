import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

export default function IntegrityVerifier() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl font-light text-white/95 mb-3">
            Integrity <span className="text-gradient">Verifier</span>
          </h1>
          <p className="text-white/40 text-sm">
            Verify complaint integrity using Merkle Tree proofs — detect any tampering
          </p>
        </div>
        <div id="integrity-mount" />
      </motion.div>
    </div>
  );
}
