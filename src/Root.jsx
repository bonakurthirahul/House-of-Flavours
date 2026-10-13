import { Suspense, lazy } from 'react';
import { useLocation, isAdminPath } from './lib/router.js';
import { PASSWORD_RESET_PATH } from './lib/authService.js';
import App from './App.jsx';
import { BrandLogo } from './components/BrandLogo.jsx';

// Admin code is split into its own chunk so customer visitors never download it.
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));
const PasswordResetScreen = lazy(() => import('./components/PasswordResetScreen.jsx'));

function AdminFallback() {
  return (
    <div className="min-h-screen bg-night-950 text-cream-100 flex items-center justify-center">
      <div className="text-center">
        <BrandLogo className="w-14 h-14 mx-auto mb-4" />
        <p className="text-sm text-cream-400">Loading admin…</p>
      </div>
    </div>
  );
}

export default function Root() {
  const { path } = useLocation();

  if (isAdminPath(path)) {
    return (
      <Suspense fallback={<AdminFallback />}>
        <AdminApp />
      </Suspense>
    );
  }

  if (path === PASSWORD_RESET_PATH) {
    return (
      <Suspense fallback={<AdminFallback />}>
        <PasswordResetScreen />
      </Suspense>
    );
  }

  return <App />;
}
