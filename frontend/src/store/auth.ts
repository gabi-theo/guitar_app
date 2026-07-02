import axios from "axios";
import { create } from "zustand";

import api, { API_BASE } from "../api/client";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  loadUser: () => Promise<void>;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem("access"),

  login: async (username, password) => {
    const { data } = await axios.post(`${API_BASE}/auth/token/`, { username, password });
    localStorage.setItem("access", data.access);
    localStorage.setItem("refresh", data.refresh);
    set({ isAuthenticated: true });
    const me = await api.get<User>("/auth/me/");
    set({ user: me.data });
  },

  register: async (username, email, password) => {
    await axios.post(`${API_BASE}/auth/register/`, { username, email, password });
    await useAuth.getState().login(username, password);
  },

  loadUser: async () => {
    if (!localStorage.getItem("access")) return;
    try {
      const me = await api.get<User>("/auth/me/");
      set({ user: me.data, isAuthenticated: true });
    } catch {
      /* interceptor handles redirect */
    }
  },

  logout: () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    set({ user: null, isAuthenticated: false });
  },
}));
