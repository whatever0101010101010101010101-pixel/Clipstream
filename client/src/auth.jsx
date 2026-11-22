import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, plan: null, usage: null });

  const refresh = useCallback(async () => {
    try {
      const data = await api('/auth/me');
      setState({ loading: false, user: data.user, plan: data.plan, usage: data.usage });
      return data;
    } catch {
      setState({ loading: false, user: null, plan: null, usage: null });
      return null;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => setState({ loading: false, user: null, plan: null, usage: null });
    window.addEventListener('infl:unauthorized', onUnauthorized);
    return () => window.removeEventListener('infl:unauthorized', onUnauthorized);
  }, []);

  const value = useMemo(() => ({
    ...state,
    refresh,
    setUsage: (usage) => setState((prev) => ({ ...prev, usage: usage || prev.usage })),
    signIn: (data) => setState({ loading: false, user: data.user, plan: data.plan, usage: data.usage || null }),
    signOut: async () => {
      try { await api('/auth/logout', { method: 'POST' }); } catch { /* session already cleared */ }
      setState({ loading: false, user: null, plan: null, usage: null });
    },
  }), [state, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
