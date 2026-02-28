import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';

export default function AuthorityDashboard() {
  return (
    <div className="px-6 py-12">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/25 rounded-full px-4 py-1.5 text-[10px] font-mono font-bold text-green-400 tracking-wider mb-4">
            <Shield className="w-3 h-3" /> AUTHORITY ACCESS REQUIRED
          </div>
          <h1 className="font-serif text-3xl font-light text-white/95 mb-3">
            Authority <span className="text-gradient">Dashboard</span>
          </h1>
          <p className="text-white/40 text-sm">
            Decrypt and review complaints assigned to your authority using RSA private keys
          </p>
        </div>
        <div id="authority-mount" />
      </motion.div>
    </div>
  );
}
