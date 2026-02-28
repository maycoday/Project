import { createContext, useContext, useState, useCallback } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => ({
    mode: localStorage.getItem('aawaaz_theme') || 'dark',
    stealthActive: false,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));

  const toggleMode = useCallback(() => {
    setTheme(prev => {
      const next = prev.mode === 'dark' ? 'light' : 'dark';
      localStorage.setItem('aawaaz_theme', next);
      return { ...prev, mode: next };
    });
  }, []);

  const toggleStealth = useCallback(() => {
    setTheme(prev => ({ ...prev, stealthActive: !prev.stealthActive }));
  }, []);

  return (
    <ThemeContext.Provider value={{ ...theme, toggleMode, toggleStealth }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
