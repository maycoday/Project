import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Shield,
  FileText,
  Search,
  BarChart3,
  Settings,
  ChevronLeft,
  Lock,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { usePrivacyStatus } from '@hooks/usePrivacyStatus';

const navItems = [
  { path: '/', icon: FileText, label: 'File Complaint', section: 'portal' },
  { path: '/track', icon: Search, label: 'Track Status', section: 'portal' },
  { path: '/verify', icon: CheckCircle2, label: 'Verify Integrity', section: 'portal' },
  { path: '/simulation', icon: Activity, label: 'Simulation', section: 'demo' },
  { path: '/authority', icon: Shield, label: 'Authority Panel', section: 'authority' },
  { path: '/patterns', icon: BarChart3, label: 'Pattern Detection', section: 'analytics' },
  { path: '/settings', icon: Settings, label: 'Settings', section: 'system' },
];

const sectionLabels = {
  portal: 'Grievance Portal',
  demo: 'Live Demo',
  authority: 'Authority Access',
  analytics: 'Analytics',
  system: 'System',
};

export default function Sidebar({ collapsed, onToggle }) {
  const location = useLocation();
  const { status, isVPN, isTor } = usePrivacyStatus();

  const groupedItems = navItems.reduce((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {});

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 256 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="fixed left-0 top-0 bottom-0 z-50 bg-ink/80 backdrop-blur-xl border-r border-white/5 flex flex-col"
    >
      {/* Logo Area */}
      <div className="p-4 flex items-center justify-between border-b border-white/5">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <img src="/assets/image-removebg-preview.png" alt="Aawaaz" className="h-10 w-auto" />
          </div>
        )}
        <button
          onClick={onToggle}
          className="w-7 h-7 rounded-full bg-saffron flex items-center justify-center text-white hover:scale-110 transition-transform"
        >
          <ChevronLeft className={`w-3.5 h-3.5 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Privacy Status */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2.5">
        <div className={`w-2 h-2 rounded-full ${
          status === 'secure' ? 'bg-green-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]' :
          status === 'warning' ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]' :
          'bg-red-400 shadow-[0_0_8px_rgba(244,63,94,0.6)]'
        } animate-pulse`} />
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-[9px] text-white/40 uppercase tracking-widest">Privacy</span>
            <span className={`text-[11px] font-mono font-semibold ${
              status === 'secure' ? 'text-green-400' : status === 'warning' ? 'text-amber-400' : 'text-red-400'
            }`}>
              {isTor ? 'TOR ACTIVE' : isVPN ? 'VPN DETECTED' : 'DIRECT CONN'}
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {Object.entries(groupedItems).map(([section, items]) => (
          <div key={section}>
            {!collapsed && (
              <div className="px-5 pt-5 pb-2 text-[9px] text-white/25 tracking-[0.15em] uppercase font-mono">
                {sectionLabels[section]}
              </div>
            )}
            {items.map(({ path, icon: Icon, label }) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-5 py-3 text-[13px] transition-all hover:bg-white/5 ${
                    isActive ? 'text-saffron bg-saffron/10 border-r-2 border-saffron' : 'text-white/50'
                  } ${collapsed ? 'justify-center px-0' : ''}`
                }
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Lock indicator */}
      <div className="p-4 border-t border-white/5 flex items-center justify-center gap-2">
        <Lock className="w-3.5 h-3.5 text-green-400" />
        {!collapsed && (
          <span className="text-[9px] text-white/30 font-mono tracking-wider">E2E ENCRYPTED</span>
        )}
      </div>
    </motion.aside>
  );
}
