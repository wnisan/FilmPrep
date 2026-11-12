import { create } from 'zustand';
import { fetchMe, loginUser, logoutUser, registerUser } from '../api/auth.js';
import { clearAccessToken, getAccessToken, refreshAccessToken } from '../api/client.js';
import { updateLanguages } from '../api/social.js';

export const useAuthStore = create((set) => ({
  user: null,
  status: 'idle', // idle | loading | authenticated | anonymous
  error: null,

  async bootstrap() {
    set({ status: 'loading', error: null });
    try {
      // Если access протух/пропал, пробуем поднять сессию через refresh cookie
      if (!getAccessToken()) {
        await refreshAccessToken();
      }
      const user = await fetchMe();
      set({ user, status: 'authenticated', error: null });
    } catch {
      clearAccessToken();
      set({ user: null, status: 'anonymous', error: null });
    }
  },

  async register(payload) {
    set({ status: 'loading', error: null });
    try {
      const user = await registerUser(payload);
      set({ user, status: 'authenticated', error: null });
      return user;
    } catch (err) {
      set({ status: 'anonymous', error: err.message });
      throw err;
    }
  },

  async login(payload) {
    set({ status: 'loading', error: null });
    try {
      const user = await loginUser(payload);
      set({ user, status: 'authenticated', error: null });
      return user;
    } catch (err) {
      set({ status: 'anonymous', error: err.message });
      throw err;
    }
  },

  setUser(user) {
    set({ user });
  },

  /** Switch the language being studied right now (header flag menu). */
  async setActiveLanguage(code) {
    const { user } = await updateLanguages({ active: code });
    set({ user });
    return user;
  },

  async logout() {
    await logoutUser();
    set({ user: null, status: 'anonymous', error: null });
  },

  /** The server already dropped the session together with the account. */
  forgetSession() {
    clearAccessToken();
    set({ user: null, status: 'anonymous', error: null });
  },
}));
