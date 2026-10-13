// Central site configuration for House of Flavours.
// Update the values below (especially the clearly-marked PLACEHOLDERS) with your real business details.

export const siteConfig = {
  brandName: 'House of Flavours',
  shortName: 'HOF',
  tagline: 'Where Every Bite Becomes an Experience.',

  // Logo: set `logoUrl` to your logo file (e.g. '/logo.png' placed in the `public/` folder).
  // Leave empty to use the built-in chef-hat emblem so branding stays consistent until you add yours.
  logoUrl: '',

  // --- Contact information ---
  phone: '+91 99480 99296',           // existing business line
  email: 'bonakurthirahul@gmail.com', // confirmed business email (also used for invoice/contact)
  address: 'Ghanapuram',              // confirmed service-area label
  hours: 'Mon - Sun, 11:00 AM - 11:00 PM',

  // --- Social media links ---
  // Only the confirmed Instagram account is listed. Facebook/YouTube removed.
  social: {
    instagram: 'https://www.instagram.com/nexorastudio.10/'
  },

  // --- Imagery (reuses the same Unsplash source style already used across the menu) ---
  heroImage: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=900&auto=format&fit=crop&q=80',
  aboutImage: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=900&auto=format&fit=crop&q=80',

  // --- Customer reviews ---
  // Reviews are NOT stored here. They are fetched live from the `public.reviews`
  // table in Supabase (see supabase/migrations/007_customer_reviews.sql) and
  // rendered by src/components/Reviews.jsx. This keeps a single source of truth
  // and avoids duplicate/placeholder review data in the bundle.
};
