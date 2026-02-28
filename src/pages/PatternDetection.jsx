import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';

export default function PatternDetection() {
  return (
    <div className="px-6 py-12">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/25 rounded-full px-4 py-1.5 text-[10px] font-mono font-bold text-purple-400 tracking-wider mb-4">
            <BarChart3 className="w-3 h-3" /> BLIND ANALYTICS ENGINE
          </div>
          <h1 className="font-serif text-3xl font-light text-white/95 mb-3">
            Pattern <span className="text-gradient">Detection</span>
          </h1>
          <p className="text-white/40 text-sm">
            Metadata-only analytics — identifies systemic issues without reading complaints
          </p>
        </div>
        <div id="patterns-mount" />
      </motion.div>
    </div>
  );
}
