import { useEffect } from 'react';
import { useLocation, navigate } from '../lib/router.js';
import { useStaffSession } from '../hooks/useStaffSession.js';
import { BrandLogo } from '../components/BrandLogo.jsx';
import { ToastProvider, Spinner, ErrorState } from './ui.jsx';
import { AdminLogin } from './AdminLogin.jsx';
import { AdminDashboard } from './AdminDashboard.jsx';

function CenterCard({ children }) {
  return (
    <div className="min-h-screen bg-night-950 text-cream-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-6"><BrandLogo className="w-14 h-14" /></div>
        {children}
      </div>
    </div>
  );
}

export function AdminApp() {
  const { path } = useLocation();
  const session = useStaffSession();
  const isLoginPath = path === '/admin/login';

  // Route guards (UX only — the database is the real security boundary).
  useEffect(() => {
    if (session.status === 'ready' && session.isStaff && isLoginPath) {
      navigate('/admin', { replace: true });
    }
    if ((session.status === 'anon' || session.status === 'ready') && !session.isStaff && !isLoginPath) {
      navigate('/admin/login', { replace: true });
    }
  }, [session.status, session.isStaff, isLoginPath]);

  const content = (() => {
    if (!session.isConfigured) {
      return (
        <CenterCard>
          <h1 className="font-display text-2xl font-bold">Admin unavailable</h1>
          <p className="mt-3 text-sm text-cream-400">
            Supabase is not configured. Set <code className="text-gold-300">VITE_SUPABASE_URL</code> and{' '}
            <code className="text-gold-300">VITE_SUPABASE_PUBLISHABLE_KEY</code>, then restart the dev server.
          </p>
          <button onClick={() => navigate('/')} className="mt-6 px-5 py-2.5 rounded-full bg-night-800 border border-gold-500/25 text-sm font-bold">Back to website</button>
        </CenterCard>
      );
    }

    if (isLoginPath) {
      if (session.status === 'ready' && session.isStaff) {
        return <CenterCard><Spinner className="w-6 h-6 text-gold-400 mx-auto" /><p className="mt-3 text-sm text-cream-400">Redirecting to dashboard…</p></CenterCard>;
      }
      return <AdminLogin onAuthenticated={() => navigate('/admin', { replace: true })} />;
    }

    if (session.status === 'loading') {
      return <CenterCard><Spinner className="w-6 h-6 text-gold-400 mx-auto" /><p className="mt-3 text-sm text-cream-400">Verifying your session…</p></CenterCard>;
    }

    if (session.status === 'error') {
      return (
        <CenterCard>
          <ErrorState message={session.error || 'Could not verify your session.'} onRetry={session.refresh} />
          <button onClick={() => navigate('/')} className="mt-6 px-5 py-2.5 rounded-full bg-night-800 border border-gold-500/25 text-sm font-bold">Back to website</button>
        </CenterCard>
      );
    }

    if (!session.isStaff) {
      return <CenterCard><Spinner className="w-6 h-6 text-gold-400 mx-auto" /><p className="mt-3 text-sm text-cream-400">Redirecting to sign in…</p></CenterCard>;
    }

    return <AdminDashboard session={session} />;
  })();

  return <ToastProvider>{content}</ToastProvider>;
}

export default AdminApp;
