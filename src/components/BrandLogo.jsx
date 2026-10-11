import { siteConfig } from '../config.js';

// Configurable brand logo for the dark premium theme.
// - If `siteConfig.logoUrl` is set, it renders your logo image.
// - Otherwise it renders the built-in gold cloche emblem.
export function BrandLogo({ className = 'w-10 h-10' }) {
  if (siteConfig.logoUrl) {
    return (
      <img
        src={siteConfig.logoUrl}
        alt={`${siteConfig.brandName} logo`}
        className={`${className} object-contain`}
      />
    );
  }

  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${siteConfig.brandName} emblem`}
    >
      <defs>
        <linearGradient id="hofGoldGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f5e8c0" />
          <stop offset="0.45" stopColor="#d4af37" />
          <stop offset="1" stopColor="#b9922a" />
        </linearGradient>
      </defs>

      {/* Outer gold ring */}
      <circle
        cx="100"
        cy="100"
        r="92"
        fill="none"
        stroke="url(#hofGoldGrad)"
        strokeWidth="6"
        strokeDasharray="230 26 90 28"
        strokeLinecap="round"
      />
      <circle cx="100" cy="100" r="80" fill="none" stroke="#d4af37" strokeOpacity="0.25" strokeWidth="1.5" />

      {/* Flame */}
      <path
        d="M100 36 C109 49 114 56 114 66 C114 76 108 83 100 83 C92 83 86 76 86 66 C86 59 90 53 95 47 C97 51 100 53 100 36 Z"
        fill="url(#hofGoldGrad)"
      />

      {/* Cloche dome */}
      <path
        d="M50 134 C50 105 73 84 100 84 C127 84 150 105 150 134 Z"
        fill="#f8f2e7"
        stroke="#1b1822"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      {/* Knob */}
      <circle cx="100" cy="84" r="7" fill="url(#hofGoldGrad)" stroke="#1b1822" strokeWidth="4" />
      {/* Base plate */}
      <rect x="40" y="134" width="120" height="12" rx="6" fill="url(#hofGoldGrad)" />
      <rect x="54" y="150" width="92" height="7" rx="3.5" fill="#1b1822" opacity="0.6" />

      {/* Steam accents */}
      <path d="M74 116 C70 108 74 102 70 96" stroke="#1b1822" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round" />
      <path d="M126 116 C130 108 126 102 130 96" stroke="#1b1822" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
