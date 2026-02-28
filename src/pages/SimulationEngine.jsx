import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';

export default function SimulationEngine() {
  return (
    <div className="px-6 py-12">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-saffron/10 border border-saffron/25 rounded-full px-4 py-1.5 text-[10px] font-mono font-bold text-saffron tracking-wider mb-4">
            <Activity className="w-3 h-3" /> LIVE SIMULATION ENGINE
          </div>
          <h1 className="font-serif text-3xl font-light text-white/95 mb-3">
            Watch Encryption <span className="text-gradient">In Action</span>
          </h1>
          <p className="text-white/40 text-sm">
            Three-panel view: User's browser → Server storage → Authority decryption
          </p>
        </div>
        {/* Simulation panels rendered from portal.js — this is the React wrapper */}
        <div id="simulation-mount" />
      </motion.div>
    </div>
  );
}
