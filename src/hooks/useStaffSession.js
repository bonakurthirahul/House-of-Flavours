import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';

// Staff/admin session gate.
//
// Security model: authorization is derived ONLY from the live Supabase session
// plus the trusted database role returned by `current_user_role()`. Nothing is
// read from localStorage, URL params or any browser-controlled state. Hiding
// the UI is never the security boundary — RLS + security-definer functions on
// the server are.

const coerceRole = (role) => (role === 'staff' || role === 'manager' ? role : 'customer');

export function useStaffSession() {
  const [status, setStatus] = useState(() => (isSupabaseConfigured ? 'loading' : 'unconfigured'));
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('customer');
  const [error, setError] = useState('');
  const mounted = useRef(true);

  const resolveRole = useCallback(async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc('current_user_role');
      if (rpcError) throw rpcError;
      return coerceRole(data);
    } catch {
      return 'customer';
    }
  }, []);

  const syncSession = useCallback(
    async (session) => {
      if (!mounted.current) return;
      if (!session?.user) {
        setUser(null);
        setRole('customer');
        setStatus('anon');
        return;
      }
      const nextRole = await resolveRole();
      if (!mounted.current) return;
      setUser({
        id: session.user.id,
        email: session.user.email,
        name:
          session.user.user_metadata?.full_name ||
          session.user.user_metadata?.name ||
          (session.user.email || '').split('@')[0]
      });
      setRole(nextRole);
      setStatus('ready');
    },
    [resolveRole]
  );

  useEffect(() => {
    mounted.current = true;
    if (!isSupabaseConfigured) {
      setStatus('unconfigured');
      return () => {
        mounted.current = false;
      };
    }

    let sub = null;
    (async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        await syncSession(data?.session || null);
      } catch (err) {
        if (mounted.current) {
          setError(err?.message || 'Could not verify your session.');
          setStatus('error');
        }
      }
    })();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer to avoid Supabase auth deadlocks inside the callback.
      setTimeout(() => {
        syncSession(session);
      }, 0);
    });
    sub = data?.subscription;

    return () => {
      mounted.current = false;
      if (sub) sub.unsubscribe();
    };
  }, [syncSession]);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setStatus('loading');
    const { data } = await supabase.auth.getSession();
    await syncSession(data?.session || null);
  }, [syncSession]);

  const signOut = useCallback(async () => {
    try {
      if (isSupabaseConfigured) await supabase.auth.signOut();
    } finally {
      setUser(null);
      setRole('customer');
      setStatus('anon');
    }
  }, []);

  return {
    status,
    user,
    role,
    isStaff: role === 'staff' || role === 'manager',
    isManager: role === 'manager',
    error,
    refresh,
    signOut,
    isConfigured: isSupabaseConfigured
  };
}
