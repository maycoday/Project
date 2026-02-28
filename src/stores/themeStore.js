import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Theme and UI preference store
 */
export const useThemeStore = create(
  persist(
    (set) => ({
      stealthMode: false,
      sidebarCollapsed: false,
      compactView: false,
      animationsEnabled: true,

      toggleStealth: () => set(state => ({ stealthMode: !state.stealthMode })),
      setSidebarCollapsed: (val) => set({ sidebarCollapsed: val }),
      toggleCompactView: () => set(state => ({ compactView: !state.compactView })),
      toggleAnimations: () => set(state => ({ animationsEnabled: !state.animationsEnabled })),
    }),
    { name: 'aawaaz-theme' }
  )
);
