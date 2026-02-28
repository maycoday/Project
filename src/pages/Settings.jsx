import { motion } from 'framer-motion';
import { Settings as SettingsIcon } from 'lucide-react';

export default function Settings() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-serif text-3xl font-light text-white/95 mb-2 flex items-center gap-3">
          <SettingsIcon className="w-7 h-7 text-saffron" />
          Settings
        </h1>
        <p className="text-white/40 text-sm mb-8">
          Customize your Aawaaz experience and security preferences
        </p>
        <div id="settings-mount" />
      </motion.div>
    </div>
  );
}
