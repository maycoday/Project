import { motion } from 'framer-motion';

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-navy flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-2 border-saffron/20 border-t-saffron rounded-full mx-auto mb-4"
        />
        <p className="text-sm text-white/40 font-mono">Initializing crypto engine...</p>
      </motion.div>
    </div>
  );
}
