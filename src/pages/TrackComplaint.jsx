import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { sha256 } from '@lib/crypto/hashUtils';
import { complaintService, activityLogService } from '@services/dataService';
import { formatTimestamp } from '@utils/helpers';

export default function TrackComplaint() {
  const [token, setToken] = useState('');
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleTrack = async () => {
    if (!token.trim()) return;
    setLoading(true);
    try {
      const tokenHash = await sha256(token.trim());
      const complaint = await complaintService.lookupByToken(tokenHash);
      const activityLogs = await activityLogService.fetchByToken(tokenHash);
      setResult(complaint);
      setLogs(activityLogs);
    } catch (err) {
      console.error('Track failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-serif text-3xl font-light text-white/95 mb-2 text-center">
          Track Your <span className="text-gradient">Complaint</span>
        </h1>
        <p className="text-white/40 text-sm text-center mb-8">
          Enter your tracking token to check status and view activity logs
        </p>

        <div className="flex gap-3 mb-8">
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your tracking token (UUID)..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm font-mono text-white/80 placeholder:text-white/20 focus:outline-none focus:border-saffron/40"
            onKeyDown={(e) => e.key === 'Enter' && handleTrack()}
          />
          <button
            onClick={handleTrack}
            disabled={loading}
            className="px-6 py-3 bg-saffron rounded-lg text-white text-sm font-semibold flex items-center gap-2 hover:bg-saffron/90 disabled:opacity-50"
          >
            <Search className="w-4 h-4" />
            {loading ? 'Searching...' : 'Track'}
          </button>
        </div>

        {/* Activity logs */}
        {logs.length > 0 && (
          <div className="glass p-4">
            <h3 className="text-xs font-semibold text-white/60 mb-3 uppercase tracking-wider">Activity Log</h3>
            <div className="space-y-2">
              {logs.map((log, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-white/3 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-saffron mt-1.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-white/70">{log.action_description}</div>
                    <div className="text-[10px] text-white/30 font-mono mt-0.5">
                      {log.authority} · {formatTimestamp(log.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
