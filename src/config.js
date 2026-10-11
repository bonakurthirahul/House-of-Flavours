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
  phone: '+91 99480 99296',           // reused from the existing project
  whatsapp: '919948099296',           // reused from the existing project (used by ordering flow)
  email: 'your-email@example.com',    // PLACEHOLDER - update with your business email
  address: 'Your Street, Your City',  // PLACEHOLDER - update with your business address / service area
  hours: 'Mon - Sun, 11:00 AM - 11:00 PM', // update with your real opening hours

  // --- Social media links (PLACEHOLDERS - update or remove) ---
  social: {
    instagram: '#',
    facebook: '#',
    youtube: '#'
  },

  // --- Imagery (reuses the same Unsplash source style already used across the menu) ---
  heroImage: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=900&auto=format&fit=crop&q=80',
  aboutImage: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=900&auto=format&fit=crop&q=80',

  // --- Customer reviews ---
  // No reviews backend exists in this project. These are clearly-marked SAMPLE placeholders.
  // Replace them with genuine feedback or clear `reviews` to an empty array to show the empty state.
  reviews: [
    { name: 'Aisha K.', rating: 5, text: 'The dum biryani was perfectly spiced and still steaming on arrival. Easily the best I have had in a long time.', sample: true },
    { name: 'Rohit S.', rating: 5, text: 'Smoky kebabs, rich curries and generous portions. The flavours feel genuinely handcrafted, not rushed.', sample: true },
    { name: 'Meera P.', rating: 4, text: 'Lovely experience overall — fresh food, quick delivery and a menu with real variety. Will order again.', sample: true }
  ]
};
