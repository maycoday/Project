import { useLocation, useNavigate } from 'react-router-dom';
import { useThemeStore } from '@stores/themeStore';

const modes = [
  { key: 'user', label: 'User Portal', path: '/' },
  { key: 'sim', label: 'Simulation', path: '/simulation' },
  { key: 'authority', label: 'Authority', path: '/authority' },
  { key: 'pattern', label: 'Pattern Detection', path: '/patterns' },
];

export default function ModeSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const { stealthMode, toggleStealth } = useThemeStore();

  const currentMode = modes.find(m => m.path === location.pathname)?.key || 'user';

  return (
    <div className="fixed top-0 left-0 right-0 z-40 h-12 bg-ink/60 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <img src="/assets/image-removebg-preview.png" alt="Aawaaz" className="h-8 w-auto" />
      </div>
      
      <div className="flex items-center gap-3">
        <button
          onClick={toggleStealth}
          className="px-3 py-1 rounded-md bg-white/5 border border-white/10 text-white/50 text-[10px] font-mono tracking-wider hover:bg-white/10 transition-all flex items-center gap-1.5"
        >
          🥷 STEALTH
        </button>
        <span className="text-[10px] font-mono text-white/30 tracking-wider">MODE</span>
        <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
          {modes.map(mode => (
            <button
              key={mode.key}
              onClick={() => navigate(mode.path)}
              className={`px-4 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                currentMode === mode.key
                  ? 'bg-saffron/20 text-saffron'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
