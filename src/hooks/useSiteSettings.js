import { createContext, useContext } from 'react';
import { siteConfig } from '../config.js';
import { normalizeSiteInfo } from '../lib/pricing.js';

// Editable restaurant info, provided by the storefront App (loaded from
// get_public_settings()). Any component outside the provider tree — e.g.
// the admin dashboard — gets the safe config.js defaults instead.
export const SiteSettingsContext = createContext(normalizeSiteInfo({}, siteConfig));

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}
