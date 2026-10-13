export const UPI_ID = "9948099296@fam";

export const INITIAL_COUPONS = [
  { code: 'FIRST50', discount: 50, minOrder: 299, type: 'flat', active: true },
  { code: 'BIRYANI10', discount: 10, minOrder: 399, type: 'percent', active: true },
  { code: 'RAHUL100', discount: 100, minOrder: 799, type: 'flat', active: true }
];

// Menu filter tabs (food type + category). Dish.category values live in src/data/catalog.js.
export const CATEGORIES = [
  'All Dishes',
  'Vegetarian',
  'Non-Vegetarian',
  'Starters',
  'Main Course',
  'Biryani and Rice',
  'Breads',
  'Desserts',
  'Beverages'
];
