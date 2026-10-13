import { useEffect, useState } from 'react';

// Minimal history-based router. The existing storefront is a single page that
// switches views with component state, so a heavy router dependency is not
// warranted. We only need real URLs for the protected /admin area.

const readPath = () => {
  if (typeof window === 'undefined') return '/';
  const { pathname, hash } = window.location;
  return `${pathname || '/'}${hash || ''}`;
};

export function navigate(to, { replace = false } = {}) {
  if (typeof window === 'undefined') return;
  if (replace) {
    window.history.replaceState({}, '', to);
  } else {
    window.history.pushState({}, '', to);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useLocation() {
  const [path, setPath] = useState(readPath);

  useEffect(() => {
    const onChange = () => setPath(readPath());
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);

  const clean = (path.split('#')[0] || '/').replace(/\/+$/, '') || '/';
  return { path: clean, full: path };
}

export function isAdminPath(path) {
  return path === '/admin' || path.startsWith('/admin/');
}
