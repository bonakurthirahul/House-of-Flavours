// House of Flavours — curated multi-cuisine Indian menu.
// Each record is a genuine menu item. Add/remove items through the
// Kitchen dashboard (Menu Editor) which stores the live menu in localStorage.
// `mergeMenuSeed(existing)` is the idempotent seed helper used to migrate the
// stored menu without deleting staff-added dishes or duplicating by name.

export const DISH_CATEGORIES = [
  'Starters',
  'Main Course',
  'Biryani and Rice',
  'Breads',
  'Desserts',
  'Beverages'
];

const vegStarters = [
  { name: 'Paneer Tikka', price: 220, img: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=700&auto=format&fit=crop&q=80', desc: 'Grilled cottage cheese cubes with mild spices.' },
  { name: 'Crispy Corn', price: 190, img: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=700&auto=format&fit=crop&q=80', desc: 'Crispy fried corn, lightly spiced.' },
  { name: 'Veg Manchurian', price: 180, img: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=700&auto=format&fit=crop&q=80', desc: 'Veg dumplings tossed in an Indo-Chinese sauce.' },
  { name: 'Hara Bhara Kebab', price: 190, img: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=700&auto=format&fit=crop&q=80', desc: 'Spinach and pea patties, pan-grilled.' },
  { name: 'Gobi 65', price: 180, img: 'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?w=700&auto=format&fit=crop&q=80', desc: 'Crispy cauliflower florets with a spicy coating.' },
  { name: 'Chilli Paneer', price: 230, img: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=700&auto=format&fit=crop&q=80', desc: 'Cottage cheese tossed in a chilli garlic sauce.' }
];

const nonVegStarters = [
  { name: 'Chicken 65', price: 260, img: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=700&auto=format&fit=crop&q=80', desc: 'Crispy fried chicken with a spicy South Indian-style coating.' },
  { name: 'Chicken Tikka', price: 290, img: 'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?w=700&auto=format&fit=crop&q=80', desc: 'Char-grilled chicken pieces in a light marinade.' },
  { name: 'Chicken Lollipop', price: 280, img: 'https://images.unsplash.com/photo-1525755662778-989d0524087e?w=700&auto=format&fit=crop&q=80', desc: 'Fried chicken wingettes in an Indo-Chinese style.' },
  { name: 'Chilli Chicken', price: 280, img: 'https://images.unsplash.com/photo-1525755662778-989d0524087e?w=700&auto=format&fit=crop&q=80', desc: 'Chicken tossed in chilli garlic soy sauce.' },
  { name: 'Tandoori Chicken', price: 320, img: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=700&auto=format&fit=crop&q=80', desc: 'Clay-oven roasted chicken with mild spices.' },
  { name: 'Apollo Fish', price: 340, img: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=700&auto=format&fit=crop&q=80', desc: 'Battered fish fry with curry-leaf tempering.' },
  { name: 'Fish Tikka', price: 350, img: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=700&auto=format&fit=crop&q=80', desc: 'Baked fish pieces in a spiced marinade.' },
  { name: 'Mutton Seekh Kebab', price: 360, img: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=700&auto=format&fit=crop&q=80', desc: 'Minced mutton kebabs, skewer-grilled.' }
];

const vegMains = [
  { name: 'Paneer Butter Masala', price: 280, img: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=700&auto=format&fit=crop&q=80', desc: 'Cottage cheese in a rich tomato-butter gravy.' },
  { name: 'Kadai Paneer', price: 260, img: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=700&auto=format&fit=crop&q=80', desc: 'Cottage cheese and capsicum with kadai spices.' },
  { name: 'Palak Paneer', price: 250, img: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=700&auto=format&fit=crop&q=80', desc: 'Cottage cheese in a spinach gravy.' },
  { name: 'Dal Tadka', price: 200, img: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=700&auto=format&fit=crop&q=80', desc: 'Yellow lentils tempered with garlic and spices.' },
  { name: 'Dal Makhani', price: 240, img: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=700&auto=format&fit=crop&q=80', desc: 'Black lentils simmered in a creamy gravy.' },
  { name: 'Veg Kolhapuri', price: 230, img: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=700&auto=format&fit=crop&q=80', desc: 'Mixed vegetables in a spicy Kolhapuri gravy.' },
  { name: 'Mushroom Masala', price: 230, img: 'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?w=700&auto=format&fit=crop&q=80', desc: 'Mushrooms in a spiced onion-tomato gravy.' },
  { name: 'Mixed Vegetable Curry', price: 220, img: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=700&auto=format&fit=crop&q=80', desc: 'Mixed vegetables in a homestyle gravy.' }
];

const nonVegMains = [
  { name: 'Butter Chicken', price: 320, img: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=700&auto=format&fit=crop&q=80', desc: 'Chicken in a rich tomato-butter gravy.' },
  { name: 'Chicken Curry', price: 280, img: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=700&auto=format&fit=crop&q=80', desc: 'Chicken in a homestyle onion-tomato gravy.' },
  { name: 'Kadai Chicken', price: 290, img: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=700&auto=format&fit=crop&q=80', desc: 'Chicken tossed with capsicum and kadai spices.' },
  { name: 'Chicken Tikka Masala', price: 310, img: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=700&auto=format&fit=crop&q=80', desc: 'Grilled chicken in a spiced tomato gravy.' },
  { name: 'Andhra Chicken Curry', price: 300, img: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=700&auto=format&fit=crop&q=80', desc: 'Chicken curry with a spicy Andhra-style masala.' },
  { name: 'Mutton Curry', price: 370, img: 'https://images.unsplash.com/photo-1545247181-516773cae754?w=700&auto=format&fit=crop&q=80', desc: 'Mutton cooked in a rich onion-ginger gravy.' },
  { name: 'Mutton Rogan Josh', price: 390, img: 'https://images.unsplash.com/photo-1545247181-516773cae754?w=700&auto=format&fit=crop&q=80', desc: 'Slow-cooked mutton in a lightly spiced gravy.' },
  { name: 'Fish Curry', price: 330, img: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=700&auto=format&fit=crop&q=80', desc: 'Fish in a tangy spiced gravy.' }
];

const biryaniRice = [
  { name: 'Veg Biryani', price: 240, isVeg: true, img: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=700&auto=format&fit=crop&q=80', desc: 'Fragrant rice with mixed vegetables and whole spices.' },
  { name: 'Paneer Biryani', price: 280, isVeg: true, img: 'https://images.unsplash.com/photo-1645177628172-a94c1f96e6db?w=700&auto=format&fit=crop&q=80', desc: 'Fragrant rice layered with marinated paneer.' },
  { name: 'Chicken Dum Biryani', price: 320, isVeg: false, img: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=700&auto=format&fit=crop&q=80', desc: 'Slow-cooked chicken layered with fragrant rice.' },
  { name: 'Chicken Fry Piece Biryani', price: 330, isVeg: false, img: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=700&auto=format&fit=crop&q=80', desc: 'Fragrant rice served with fried chicken pieces.' },
  { name: 'Chicken Boneless Biryani', price: 350, isVeg: false, img: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=700&auto=format&fit=crop&q=80', desc: 'Fragrant rice layered with boneless chicken.' },
  { name: 'Mutton Dum Biryani', price: 420, isVeg: false, img: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=700&auto=format&fit=crop&q=80', desc: 'Slow-cooked mutton layered with fragrant rice.' },
  { name: 'Egg Biryani', price: 200, isVeg: false, img: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=700&auto=format&fit=crop&q=80', desc: 'Fragrant rice with spiced boiled eggs.' },
  { name: 'Jeera Rice', price: 120, isVeg: true, img: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=700&auto=format&fit=crop&q=80', desc: 'Long-grain rice tempered with cumin.' },
  { name: 'Steamed Rice', price: 100, isVeg: true, img: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=700&auto=format&fit=crop&q=80', desc: 'Plain steamed long-grain rice.' }
];

const breads = [
  { name: 'Butter Naan', price: 60, isVeg: true, img: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=700&auto=format&fit=crop&q=80', desc: 'Soft leavened bread finished with butter.' },
  { name: 'Plain Naan', price: 50, isVeg: true, img: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=700&auto=format&fit=crop&q=80', desc: 'Soft leavened bread baked in the tandoor.' },
  { name: 'Garlic Naan', price: 70, isVeg: true, img: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=700&auto=format&fit=crop&q=80', desc: 'Soft naan topped with garlic and butter.' },
  { name: 'Tandoori Roti', price: 40, isVeg: true, img: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=700&auto=format&fit=crop&q=80', desc: 'Whole-wheat flatbread baked in the tandoor.' },
  { name: 'Butter Roti', price: 45, isVeg: true, img: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=700&auto=format&fit=crop&q=80', desc: 'Whole-wheat flatbread finished with butter.' },
  { name: 'Chapati', price: 30, isVeg: true, img: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=700&auto=format&fit=crop&q=80', desc: 'Soft whole-wheat flatbread.' }
];

const desserts = [
  { name: 'Gulab Jamun', price: 80, isVeg: true, img: 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=700&auto=format&fit=crop&q=80', desc: 'Warm milk dumplings in sugar syrup.' },
  { name: 'Double Ka Meetha', price: 110, isVeg: true, img: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=700&auto=format&fit=crop&q=80', desc: 'Bread-based Indian dessert with a rich syrup.' },
  { name: 'Qubani Ka Meetha', price: 120, isVeg: true, img: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=700&auto=format&fit=crop&q=80', desc: 'Apricot-based Indian dessert.' },
  { name: 'Rasmalai', price: 110, isVeg: true, img: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=700&auto=format&fit=crop&q=80', desc: 'Soft cottage-cheese discs in chilled milk.' },
  { name: 'Brownie with Ice Cream', price: 140, isVeg: true, img: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=700&auto=format&fit=crop&q=80', desc: 'Chocolate brownie served with ice cream.' }
];

const beverages = [
  { name: 'Masala Chai', price: 40, isVeg: true, img: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=700&auto=format&fit=crop&q=80', desc: 'Spiced Indian tea, served hot.' },
  { name: 'Fresh Lime Soda', price: 60, isVeg: true, img: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=700&auto=format&fit=crop&q=80', desc: 'Fresh lime with soda, sweet or salty.' },
  { name: 'Sweet Lassi', price: 70, isVeg: true, img: 'https://images.unsplash.com/photo-1556881286-fc6915169721?w=700&auto=format&fit=crop&q=80', desc: 'Sweetened chilled yogurt drink.' },
  { name: 'Mango Lassi', price: 90, isVeg: true, img: 'https://images.unsplash.com/photo-1556881286-fc6915169721?w=700&auto=format&fit=crop&q=80', desc: 'Mango and yogurt chilled drink.' },
  { name: 'Buttermilk', price: 40, isVeg: true, img: 'https://images.unsplash.com/photo-1556881286-fc6915169721?w=700&auto=format&fit=crop&q=80', desc: 'Spiced chilled buttermilk.' },
  { name: 'Cold Coffee', price: 100, isVeg: true, img: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=700&auto=format&fit=crop&q=80', desc: 'Chilled coffee-based drink.' },
  { name: 'Soft Drinks', price: 40, isVeg: true, img: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=700&auto=format&fit=crop&q=80', desc: 'Chilled carbonated soft drink.' }
];

const REQ_ITEMS = [
  { cat: 'Starters', veg: vegStarters, nonVeg: nonVegStarters },
  { cat: 'Main Course', veg: vegMains, nonVeg: nonVegMains },
  { cat: 'Biryani and Rice', items: biryaniRice },
  { cat: 'Breads', items: breads },
  { cat: 'Desserts', items: desserts },
  { cat: 'Beverages', items: beverages }
];

const slugify = (str) =>
  str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

const buildCatalog = () => {
  const out = [];
  REQ_ITEMS.forEach((section) => {
    const push = (items, veg) => {
      items.forEach((item) => {
        if (!item) return;
        out.push({
          id: `hof_${slugify(section.cat)}_${slugify(item.name)}`,
          name: item.name,
          category: section.cat,
          price: item.price,
          description: item.desc,
          isVeg: veg != null ? veg : Boolean(item.isVeg),
          image: item.img,
          isAvailable: true
        });
      });
    };
    if (section.veg) push(section.veg, true);
    if (section.nonVeg) push(section.nonVeg, false);
    if (section.items) push(section.items, null);
  });
  return out;
};

export const COMPLETE_DEFAULT_CATALOG = buildCatalog();

// Kept for backwards compatibility (previously generated the old 125-dish list).
export const GENERATE_COMPLETE_CATALOG = () => COMPLETE_DEFAULT_CATALOG;

const isLegacyDish = (d) =>
  typeof d?.id === 'string' && d.id.startsWith('rf_dish_');

const normName = (name) =>
  typeof name === 'string' ? name.trim().toLowerCase().replace(/\s+/g, ' ') : '';

// Idempotent seed/migration for the persisted menu:
// - drops legacy generated records (rf_dish_*),
// - keeps any staff-added dishes that are not part of the curated seed,
// - guarantees each curated dish appears exactly once (matched case-insensitively by name),
// - preserves staff edits to price / availability / veg flag where a matching dish already exists.
export function mergeMenuSeed(existing) {
  const seed = COMPLETE_DEFAULT_CATALOG;
  const base = Array.isArray(existing) ? existing : [];
  const seedNames = new Set(seed.map((s) => normName(s.name)));

  const keptCustom = [];
  const seen = new Set();

  for (const d of base) {
    if (isLegacyDish(d)) continue;
    const n = normName(d.name);
    if (!n || seedNames.has(n) || seen.has(n)) continue;
    seen.add(n);
    keptCustom.push(d);
  }

  const out = [...keptCustom];
  for (const s of seed) {
    const n = normName(s.name);
    if (seen.has(n)) continue;
    seen.add(n);
    const stored = base.find((d) => normName(d.name) === n && !isLegacyDish(d));
    out.push(
      stored
        ? { ...s, price: stored.price, isAvailable: stored.isAvailable ?? true, isVeg: stored.isVeg ?? s.isVeg }
        : s
    );
  }

  return out;
}

export const QUICK_UPSELL_ITEMS = [
  {
    id: 'up_salan',
    name: 'Extra Mirchi Ka Salan (250ml)',
    price: 40,
    isVeg: true,
    image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=300&auto=format&fit=crop&q=80'
  },
  {
    id: 'up_raita',
    name: 'Chilled Dahi Boondi Raita',
    price: 35,
    isVeg: true,
    image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=300&auto=format&fit=crop&q=80'
  },
  {
    id: 'up_thums',
    name: 'Thums Up Charged (250ml Can)',
    price: 40,
    isVeg: true,
    image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=300&auto=format&fit=crop&q=80'
  }
];