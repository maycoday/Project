import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Authentication store for authority access
 * In production, this would integrate with Supabase Auth
 */
export const useAuthStore = create(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      role: null, // 'authority' | 'admin' | null
      authorityCode: null, // 'HR' | 'ICC' | 'NGO'
      sessionExpiry: null,

      login: (role, authorityCode) => {
        const expiry = Date.now() + (8 * 60 * 60 * 1000); // 8-hour session
        set({ isAuthenticated: true, role, authorityCode, sessionExpiry: expiry });
      },

      logout: () => {
        set({ isAuthenticated: false, role: null, authorityCode: null, sessionExpiry: null });
      },

      checkSession: () => {
        const { sessionExpiry } = get();
        if (sessionExpiry && Date.now() > sessionExpiry) {
          get().logout();
          return false;
        }
        return get().isAuthenticated;
      },
    }),
    { name: 'aawaaz-auth' }
  )
);
