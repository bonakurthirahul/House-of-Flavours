import { siteConfig } from '../config.js';
import { BrandLogo } from './BrandLogo.jsx';
import { Phone, Mail, MapPin, Clock, ArrowRight } from './icons.jsx';

const NAV_LINKS = [
  { label: 'Home', id: 'home' },
  { label: 'About Us', id: 'about' },
  { label: 'Our Menu', id: 'menu' },
  { label: 'Reviews', id: 'reviews' },
  { label: 'Contact', id: 'contact' }
];

export function Footer({ onNavigate }) {
  const socialEntries = Object.entries(siteConfig.social || {}).filter(([, url]) => url);

  return (
    <footer className="relative bg-night-950 border-t border-gold-500/10 mt-auto overflow-hidden">
      <div aria-hidden="true" className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[40rem] h-[20rem] rounded-full bg-gold-500/8 blur-[120px]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-16 pb-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
              <BrandLogo className="w-12 h-12" />
              <div>
                <span className="font-display text-xl font-bold text-cream-100">House of <span className="text-gradient-gold">Flavours</span></span>
                <p className="text-[10px] uppercase tracking-[0.28em] text-cream-500">Dum Biryani &amp; Kebabs</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-cream-400 leading-relaxed max-w-md">
              {siteConfig.tagline} Freshly prepared food, quality ingredients and memorable flavours — made for sharing.
            </p>
            {socialEntries.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2.5">
                {socialEntries.map(([key, url]) => (
                  <a
                    key={key}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-full bg-night-850 border border-gold-500/15 text-xs font-semibold text-cream-300 capitalize hover:border-gold-500/50 hover:text-gold-300 transition"
                  >
                    {key}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div>
            <h3 className="text-sm font-bold text-cream-100 uppercase tracking-wider">Quick Links</h3>
            <ul className="mt-4 space-y-2.5">
              {NAV_LINKS.map((link) => (
                <li key={link.id}>
                  <button onClick={() => onNavigate(link.id)} className="group text-sm text-cream-400 hover:text-gold-300 transition inline-flex items-center gap-1.5">
                    <ArrowRight className="w-3 h-3 text-gold-500/50 transition-transform group-hover:translate-x-0.5" />
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-bold text-cream-100 uppercase tracking-wider">Contact</h3>
            <ul className="mt-4 space-y-3 text-sm text-cream-400">
              <li className="flex items-start gap-2.5"><Phone className="w-4 h-4 text-gold-400 mt-0.5 shrink-0" /> {siteConfig.phone}</li>
              <li className="flex items-start gap-2.5"><Mail className="w-4 h-4 text-gold-400 mt-0.5 shrink-0" /> {siteConfig.email}</li>
              <li className="flex items-start gap-2.5"><MapPin className="w-4 h-4 text-gold-400 mt-0.5 shrink-0" /> {siteConfig.address}</li>
              <li className="flex items-start gap-2.5"><Clock className="w-4 h-4 text-gold-400 mt-0.5 shrink-0" /> {siteConfig.hours}</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-gold-500/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-cream-500">
          <span>© {new Date().getFullYear()} {siteConfig.brandName}. All rights reserved.</span>
          <span className="flex items-center gap-1.5">Crafted with <span className="text-burgundy-400">♥</span> for flavour lovers</span>
        </div>
      </div>
    </footer>
  );
}
