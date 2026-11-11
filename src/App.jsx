import { useState, useEffect, useMemo, useCallback } from 'react';
import { INITIAL_COUPONS } from './constants.js';
import { COMPLETE_DEFAULT_CATALOG, QUICK_UPSELL_ITEMS, mergeMenuSeed } from './data/catalog.js';
import { useLocalStorage } from './hooks/useLocalStorage.js';
import { isSupabaseConfigured } from './lib/supabase.js';
import { registerCustomer, loginCustomer, logout as supabaseLogout, restoreSession, onSupabaseAuthChange } from './lib/authService.js';
import { isSchemaReady, loadMenuFromDb, loadOrdersFromDb, placeOrderToDb, getPublicSettings, subscribeToOrders } from './lib/dbService.js';
import { computeOrderTotals, normalizeSettings, normalizeSiteInfo, DEFAULT_PRICING_SETTINGS } from './lib/pricing.js';
import { navigate } from './lib/router.js';
import { siteConfig } from './config.js';
import { SiteSettingsContext } from './hooks/useSiteSettings.js';
import { Plus, Minus, ShoppingBag } from './components/icons.jsx';
import { OrdersView } from './components/OrdersView.jsx';
import { Navbar } from './components/Navbar.jsx';
import { Hero } from './components/Hero.jsx';
import { About } from './components/About.jsx';
import { MenuSection } from './components/MenuSection.jsx';
import { Reviews } from './components/Reviews.jsx';
import { Contact } from './components/Contact.jsx';
import { Footer } from './components/Footer.jsx';
import { AuthScreen } from './components/AuthScreen.jsx';
import { InvoiceModal } from './components/Invoice.jsx';

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [pendingSection, setPendingSection] = useState(null);
  // Session is NEVER hydrated from localStorage: it is rebuilt from the live
  // Supabase session (see restoreSession effect below).
  const [currentUser, setCurrentUser] = useState(null);
  const [isStoreOpen, setIsStoreOpen] = useLocalStorage('rahulfoods_store_open_v9', true);

  const [menuItems, setMenuItems] = useLocalStorage('rahulfoods_fresh_2026_catalog_v9', COMPLETE_DEFAULT_CATALOG);
  const [cart, setCart] = useLocalStorage('rahulfoods_active_cart_v9', []);
  const [orders, setOrders] = useLocalStorage('rahulfoods_active_orders_v9', []);
  const [coupons] = useLocalStorage('rahulfoods_active_coupons_v9', INITIAL_COUPONS);

  const [selectedCouponCode, setSelectedCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Dishes');

  const [checkoutName, setCheckoutName] = useState('');
  const [checkoutPhone, setCheckoutPhone] = useState('');
  const [checkoutAddress, setCheckoutAddress] = useState('');
  const [cookingInstructions, setCookingInstructions] = useState('');
  // Canonical methods ('UPI' | 'COD'); friendly labels are rendered from settings.
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [latestCompletedOrder, setLatestCompletedOrder] = useState(null);

  // Clean Auth Modal States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authAction, setAuthAction] = useState('login'); // 'login' | 'register'
  const [inputUser, setInputUser] = useState('');
  const [inputPass, setInputPass] = useState('');
  const [inputName, setInputName] = useState('');
  const [inputPhone, setInputPhone] = useState('');
  const [authErrorMsg, setAuthErrorMsg] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Supabase integration state (only active when VITE_SUPABASE_* env vars exist)
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [dbNotice, setDbNotice] = useState('');
  const [dbCustomerOrders, setDbCustomerOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');

  // Configurable pricing (GST + delivery) — loaded from the database settings so
  // the storefront shows exactly what public.place_order() will enforce.
  const [pricingSettings, setPricingSettings] = useState(DEFAULT_PRICING_SETTINGS);

  // Editable restaurant info (name, phone, logo, UPI id, payment methods).
  // Falls back to the confirmed values in src/config.js when the database
  // is unavailable or a setting has not been saved yet.
  const [siteInfo, setSiteInfo] = useState(() => normalizeSiteInfo({}, siteConfig));

  // Prevent duplicate checkout submissions (double-click / retry while saving).
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  useEffect(() => {
    if (currentUser && currentUser.role === 'customer') {
      setCheckoutName(currentUser.name || currentUser.username);
      setCheckoutPhone(currentUser.phone || '');
    }
  }, [currentUser]);

  // Restore a remembered username so returning customers sign in faster.
  useEffect(() => {
    try {
      const remembered = localStorage.getItem('rahulfoods_remember_user_v9');
      if (remembered) {
        setInputUser(remembered);
        setRememberMe(true);
      }
    } catch (err) {
      console.warn('Remember-me restore failed:', err);
    }
  }, []);

  // Supabase: restore the persisted auth session (source of truth when configured).
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    restoreSession().then((user) => {
      if (active) setCurrentUser(user);
    });
    const subscription = onSupabaseAuthChange((user) => {
      if (active) setCurrentUser(user);
    });
    return () => {
      active = false;
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  // Supabase: probe the schema, load the menu from the database (when available).
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    (async () => {
      try {
        const ready = await isSchemaReady();
        if (!active) return;
        setSupabaseReady(ready);
        if (!ready) {
          setDbNotice('Database tables are not set up yet. Run supabase/migrations/001_initial_schema.sql in the Supabase Dashboard SQL Editor.');
          return;
        }
        const dbm = await loadMenuFromDb();
        if (!active) return;
        if (dbm.items.length) setMenuItems(dbm.items);
        setDbNotice(dbm.items.length ? '' : 'Database menu is empty — Kitchen → Menu Editor → “Sync to database”.');
      } catch (err) {
        if (active) {
          setSupabaseReady(false);
          setDbNotice('Could not connect to the database: ' + err.message);
        }
      }
    })();
    return () => { active = false; };
  }, []);

  // Load the configurable GST / delivery settings and editable site info
  // (public keys only). When the database is unavailable the safe local
  // defaults (config.js values, no GST, flat fee) are used.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabaseReady) return;
    let active = true;
    getPublicSettings().then((raw) => {
      if (active && raw) {
        setPricingSettings(normalizeSettings(raw));
        setSiteInfo(normalizeSiteInfo(raw, siteConfig));
      }
    });
    return () => { active = false; };
  }, [supabaseReady]);

  // One-time idempotent menu migration: seeds the curated menu into the stored
  // catalog, removes the old legacy generated dishes, keeps staff-added dishes
  // and preserves staff price/availability edits (see mergeMenuSeed).
  useEffect(() => {
    try {
      const raw = localStorage.getItem('rahulfoods_fresh_2026_catalog_v9');
      const current = raw ? JSON.parse(raw) : null;
      const merged = mergeMenuSeed(current);
      if (!current || JSON.stringify(merged) !== JSON.stringify(current)) {
        setMenuItems(merged);
      }
    } catch (err) {
      console.warn('Menu seed migration skipped:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mapOrderRow = (o) => ({
    orderId: o.order_id,
    timestamp: new Date(o.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    createdAt: o.created_at,
    cancelledAt: o.cancelled_at || null,
    customer: { name: o.customer_name, phone: o.phone, address: o.address, instructions: o.instructions || '' },
    items: (o.order_items || []).map((li) => ({ menuId: li.menu_id, name: li.name, quantity: li.quantity, price: Number(li.price) })),
    subtotal: Number(o.subtotal),
    discountAmount: Number(o.discount),
    gstAmount: Number(o.gst),
    cgst: Number(o.cgst || 0),
    sgst: Number(o.sgst || 0),
    igst: Number(o.igst || 0),
    gstRate: Number(o.gst_rate || 0),
    deliveryFee: Number(o.delivery_fee),
    deliveryDistanceKm: o.delivery_distance_km == null ? null : Number(o.delivery_distance_km),
    deliveryRatePerKm: o.delivery_rate_per_km == null ? null : Number(o.delivery_rate_per_km),
    paymentStatus: o.payment_status || 'Pending',
    grandTotal: Number(o.total),
    paymentMethod: o.payment_method,
    status: o.status,
    source: 'supabase'
  });

  // Customer authentication. Staff authenticate exclusively at /admin/login.
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthErrorMsg('');
    if (!isSupabaseConfigured) {
      setAuthErrorMsg('Authentication is unavailable: Supabase is not configured.');
      return;
    }

    const cleanUser = inputUser.trim();
    const cleanPass = inputPass.trim();
    setIsAuthenticating(true);
    try {
      if (authAction === 'login') {
        const res = await loginCustomer(cleanUser, cleanPass);
        if (!res.ok) {
          setAuthErrorMsg(res.error);
          return;
        }
        setCurrentUser(res.user);
      } else {
        const res = await registerCustomer({
          username: cleanUser,
          password: cleanPass,
          name: inputName,
          phone: inputPhone
        });
        if (!res.ok) {
          setAuthErrorMsg(res.error);
          return;
        }
        if (res.needsConfirmation) {
          setAuthErrorMsg('Account created, but email confirmation is enabled on this Supabase project. Sign-in stays blocked until the owner verifies the account or disables “Confirm email” (Supabase → Authentication → Providers → Email).');
          return;
        }
        setCurrentUser(res.user);
        setInputName('');
        setInputPhone('');
      }

      setShowAuthModal(false);
      setInputUser('');
      setInputPass('');
      try {
        if (rememberMe) localStorage.setItem('rahulfoods_remember_user_v9', cleanUser);
        else localStorage.removeItem('rahulfoods_remember_user_v9');
      } catch (rmErr) {
        console.warn('Remember-me save failed:', rmErr);
      }
    } catch (err) {
      setAuthErrorMsg('Network error while authenticating. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = () => {
    if (isSupabaseConfigured) {
      supabaseLogout().catch(() => {});
    }
    setCurrentUser(null);
    setActiveTab('home');
    window.scrollTo({ top: 0 });
  };

  // Smooth-scroll to a section on the Home page (switches to Home view first if needed).
  const goToSection = (id) => {
    setActiveTab('home');
    setPendingSection(id);
  };

  useEffect(() => {
    if (activeTab === 'home' && pendingSection) {
      const el = document.getElementById(pendingSection);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        setPendingSection(null);
      }
    }
  }, [activeTab, pendingSection]);

  const addToCart = (dish) => {
    if (!isStoreOpen || !dish.isAvailable) return;
    setCart((prev) => {
      const ex = prev.find((i) => i.id === dish.id);
      return ex
        ? prev.map((i) => (i.id === dish.id ? { ...i, quantity: i.quantity + 1 } : i))
        : [...prev, { ...dish, quantity: 1 }];
    });
  };

  const updateQuantity = (dishId, delta) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.id === dishId) {
          const n = i.quantity + delta;
          return n > 0 ? { ...i, quantity: n } : null;
        }
        return i;
      }).filter(Boolean)
    );
  };

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);

  const discountAmount = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (subtotal < appliedCoupon.minOrder) return 0;
    return appliedCoupon.type === 'percent'
      ? Math.round((subtotal * appliedCoupon.discount) / 100)
      : appliedCoupon.discount;
  }, [appliedCoupon, subtotal]);

  // Server-aligned local totals. Flat delivery is shown up front; distance
  // delivery is resolved at checkout from owner-defined zones (see pricing.js).
  const totals = useMemo(
    () => computeOrderTotals({ subtotal, discount: discountAmount, distanceKm: null, settings: pricingSettings }),
    [subtotal, discountAmount, pricingSettings]
  );
  const { deliveryFee, gst: gstAmount, total: grandTotal } = totals;
  const totalCartCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);

  // Resolve the selected method against the owner-configured list (falls
  // back to the first configured method, so a stale choice can't persist).
  const activePaymentMethod = useMemo(
    () => (siteInfo.paymentMethods.includes(paymentMethod) ? paymentMethod : siteInfo.paymentMethods[0]),
    [paymentMethod, siteInfo.paymentMethods]
  );
  const isUpiPayment = /^upi/i.test(activePaymentMethod);

  // Collision-resistant human-readable order id (32^5 ≈ 33M combinations;
  // the database unique constraint is the final guard).
  const generateOrderId = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const rand = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    return `RF-${rand}`;
  };

  // Everything the invoice template needs (editable site info + tax context).
  const invoiceInfo = useMemo(
    () => ({
      ...siteInfo,
      gstRegistered: pricingSettings.gstRegistered,
      gstin: pricingSettings.gstin,
      gstRate: pricingSettings.gstRate
    }),
    [siteInfo, pricingSettings]
  );

  const handleApplyCoupon = (e) => {
    e.preventDefault();
    setCouponError('');
    const c = coupons.find(x => x.code.toUpperCase() === selectedCouponCode.trim().toUpperCase() && x.active);
    if (!c) {
      setCouponError('Invalid or inactive coupon code');
      return;
    }
    if (subtotal < c.minOrder) {
      setCouponError(`Minimum order ₹${c.minOrder} required for ${c.code}`);
      return;
    }
    setAppliedCoupon(c);
  };

  const handleProceedOrder = async (e) => {
    e.preventDefault();
    if (isPlacingOrder) return;
    if (!isStoreOpen) {
      alert("The kitchen is currently closed. We are not accepting orders right now.");
      return;
    }
    if (cart.length === 0) return;
    if (!checkoutName.trim() || !checkoutPhone.trim() || !checkoutAddress.trim()) {
      alert('Please enter Name, Phone Number, and Delivery Address.');
      return;
    }
    // In distance mode the fee cannot be shown until the address is matched to a
    // verified zone. The server is authoritative; block rather than guess.
    if (pricingSettings.deliveryMode === 'distance' && !totals.deliveryOk) {
      alert('Delivery charges for your area are confirmed by the kitchen. Please place the order and we will confirm the exact delivery charge, or call us to verify your location.');
      return;
    }

    // Orders are created exclusively through Supabase. If the database is not
    // reachable we surface the reason and KEEP the cart — we never fabricate a
    // local order or fall back to any external ordering flow.
    if (!isSupabaseConfigured || !supabaseReady) {
      setDbNotice('Orders are unavailable right now because the database is not connected. Your cart has been kept — please try again shortly.');
      return;
    }

    setIsPlacingOrder(true);
    const orderId = generateOrderId();
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    try {
      const placed = await placeOrderToDb({
        orderId,
        customerName: checkoutName.trim(),
        phone: checkoutPhone.trim(),
        address: checkoutAddress,
        instructions: cookingInstructions,
        paymentMethod: activePaymentMethod,
        discount: discountAmount,
        // The coupon code is re-validated server-side against public.coupons;
        // the browser-submitted discount amount is never trusted.
        couponCode: appliedCoupon ? appliedCoupon.code : null,
        items: cart.map((i) => ({
          ...i,
          // Only genuine DB menu items carry a menu_id; extras are priced server-side.
          menuId: menuItems.some((d) => d.id === i.id) ? i.id : null
        }))
      });
      const newOrder = {
        orderId: placed.order_id,
        timestamp,
        createdAt: new Date().toISOString(),
        userId: currentUser ? currentUser.username || 'guest' : 'guest',
        customer: { name: checkoutName.trim(), phone: checkoutPhone.trim(), address: checkoutAddress, instructions: cookingInstructions },
        items: [...cart],
        subtotal: Number(placed.subtotal),
        discountAmount: Number(placed.discount),
        couponCode: placed.coupon_code || appliedCoupon?.code || null,
        gstAmount: Number(placed.gst),
        cgst: Number(placed.cgst || 0),
        sgst: Number(placed.sgst || 0),
        igst: Number(placed.igst || 0),
        gstRate: Number(placed.gst_rate || 0),
        deliveryFee: Number(placed.delivery_fee),
        deliveryDistanceKm: placed.delivery_distance_km == null ? null : Number(placed.delivery_distance_km),
        deliveryRatePerKm: placed.delivery_rate_per_km == null ? null : Number(placed.delivery_rate_per_km),
        paymentStatus: placed.payment_status || 'Pending',
        grandTotal: Number(placed.total),
        paymentMethod: placed.payment_method || activePaymentMethod,
        status: 'Order Received',
        source: 'supabase'
      };
      // Success is only ever reached after Supabase confirms the saved order.
      setOrders((prev) => [newOrder, ...prev]);
      setLatestCompletedOrder(newOrder);
      setCart([]);
    } catch (err) {
      setDbNotice('Order could not be saved: ' + err.message + ' Your cart was kept; please retry.');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // Invoice downloads are handled by InvoiceModal / buildInvoiceHtml
  // (src/components/Invoice.jsx), which HTML-escapes every user-controlled
  // value before embedding it in the downloaded document.

  const userScopedOrders = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'staff') return orders;
    return orders.filter(o => o.userId === currentUser.username || o.customer?.phone === currentUser.phone);
  }, [orders, currentUser]);

  // Merge DB-persisted orders with this session's local orders (dedupe by orderId).
  const customerOrders = useMemo(() => {
    const merged = new Map();
    (dbCustomerOrders || []).forEach((o) => merged.set(o.order_id, mapOrderRow(o)));
    userScopedOrders.forEach((o) => { if (!merged.has(o.orderId)) merged.set(o.orderId, o); });
    return Array.from(merged.values());
  }, [dbCustomerOrders, userScopedOrders]);

  // Customer: load their own persisted orders from Supabase (RLS returns only
  // their rows). Relay loading/error so the Orders page can show real states.
  const refreshCustomerOrders = useCallback(() => {
    if (!isSupabaseConfigured || !supabaseReady || !currentUser) return Promise.resolve();
    setOrdersLoading(true);
    setOrdersError('');
    return loadOrdersFromDb()
      .then((rows) => setDbCustomerOrders(rows || []))
      .catch((err) => setOrdersError(err?.message || 'Could not load your orders.'))
      .finally(() => setOrdersLoading(false));
  }, [isSupabaseConfigured, supabaseReady, currentUser]);

  useEffect(() => {
    if (activeTab === 'orders' && currentUser) refreshCustomerOrders();
  }, [activeTab, currentUser, refreshCustomerOrders]);

  // Live status/cancellation updates for the signed-in customer. RLS limits the
  // payload to their own rows, so this never leaks other customers' orders.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabaseReady || !currentUser) return undefined;
    const unsubscribe = subscribeToOrders(() => { refreshCustomerOrders(); }, { channelName: 'customer-orders' });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [isSupabaseConfigured, supabaseReady, currentUser, refreshCustomerOrders]);

  const filteredDishes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return menuItems.filter((dish) => {
      const matchSearch = !query || dish.name.toLowerCase().includes(query);
      const matchCat =
        selectedCategory === 'All Dishes' ||
        (selectedCategory === 'Vegetarian' && dish.isVeg) ||
        (selectedCategory === 'Non-Vegetarian' && !dish.isVeg) ||
        dish.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [menuItems, searchQuery, selectedCategory]);

  // Lookup for order-item thumbnails (order_items store menu_id + name + price).
  const menuById = useMemo(() => Object.fromEntries(menuItems.map((d) => [d.id, d])), [menuItems]);

  return (
    <SiteSettingsContext.Provider value={siteInfo}>
      <div className="min-h-screen flex flex-col bg-night-950 text-cream-100">

      {/* Header / Navigation */}
      <Navbar
        onNavigate={goToSection}
        onOrderNow={() => goToSection('menu')}
        onOpenCart={() => { setActiveTab('cart'); window.scrollTo({ top: 0 }); }}
        onOpenOrders={() => { setActiveTab('orders'); window.scrollTo({ top: 0 }); }}
        onLogin={() => { setShowAuthModal(true); setAuthErrorMsg(''); }}
        onLogout={handleLogout}
        onOpenStaff={() => navigate('/admin')}
        currentUser={currentUser}
        totalCartCount={totalCartCount}
      />

      {/* Kitchen Closed Banner */}
      {!isStoreOpen && (
        <div className="bg-burgundy-600 text-cream-100 text-xs font-bold py-2 px-4 text-center">
          ⚠️ Kitchen is currently offline. We will resume taking orders shortly!
        </div>
      )}

      {/* Database / sync notice banner */}
      {dbNotice && (
        <div className="bg-amber-500/15 text-amber-200 text-xs font-semibold py-2 px-4 text-center border-b border-amber-500/20">
          ℹ️ {dbNotice}
          <button onClick={() => setDbNotice('')} className="ml-2 underline decoration-dotted hover:text-cream-100">Dismiss</button>
        </div>
      )}

      {/* VIEW: HOME (default landing page) */}
      {activeTab === 'home' && (
        <>
          <Hero
            onExploreMenu={() => goToSection('menu')}
            onContact={() => goToSection('contact')}
          />
          <About />
          <MenuSection
            dishes={filteredDishes}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            cart={cart}
            isStoreOpen={isStoreOpen}
            onAdd={addToCart}
            onUpdate={updateQuantity}
            onOrderNow={() => { setActiveTab('cart'); window.scrollTo({ top: 0 }); }}
          />
          <Reviews
            currentUser={currentUser}
            onLogin={() => { setShowAuthModal(true); setAuthErrorMsg(''); }}
          />
          <Contact />
        </>
      )}

      {/* VIEW: CART & CHECKOUT */}
      {activeTab === 'cart' && (
        <main className="flex-1 max-w-2xl w-full mx-auto p-3.5 sm:p-6 bg-stone-100 text-stone-900">
          <h2 className="text-lg sm:text-xl font-black mb-3 sm:mb-4">Your Order & Checkout</h2>

          {cart.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl text-center border border-stone-200">
              <p className="text-xs text-stone-400 mb-3">Your cart is empty.</p>
              <button onClick={() => goToSection('menu')} className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl">
                Browse Biryani Menu
              </button>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">

              {/* Cart Items */}
              <div className="bg-white rounded-2xl p-3 sm:p-4 border border-stone-200 divide-y divide-stone-100">
                {cart.map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="pr-2">
                      <div className="font-bold">{item.name}</div>
                      <div className="text-[11px] text-stone-400">₹{item.price} each</div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      <button onClick={() => updateQuantity(item.id, -1)} className="w-6 h-6 bg-stone-100 rounded font-bold flex items-center justify-center">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-bold">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="w-6 h-6 bg-stone-100 rounded font-bold flex items-center justify-center">
                        <Plus className="w-3 h-3" />
                      </button>
                      <span className="font-black min-w-10 text-right">₹{item.price * item.quantity}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Upsell Tray with Photos */}
              <div className="bg-amber-50/70 border border-amber-200 p-3 sm:p-4 rounded-2xl">
                <h4 className="text-xs font-bold text-amber-950 mb-2">Frequently Bought Together</h4>
                <div className="grid grid-cols-3 gap-2">
                  {QUICK_UPSELL_ITEMS.map((up) => (
                    <div key={up.id} className="bg-white p-2 rounded-xl border border-amber-200 text-center flex flex-col justify-between">
                      <img src={up.image} alt={up.name} className="h-14 sm:h-16 w-full object-cover rounded-lg mb-1" />
                      <div className="text-[9px] sm:text-[10px] font-bold text-stone-900 leading-tight line-clamp-1">{up.name}</div>
                      <div className="text-[10px] text-amber-700 font-bold mb-1">₹{up.price}</div>
                      <button onClick={() => addToCart({ ...up, category: 'Sides', isAvailable: true })} className="w-full py-1 bg-amber-600 text-white rounded-lg text-[9px] sm:text-[10px] font-bold">
                        + ADD
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coupon Engine */}
              <div className="bg-white p-3 sm:p-4 rounded-2xl border border-stone-200">
                <form onSubmit={handleApplyCoupon} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Coupon (FIRST50, RAHUL100)"
                    value={selectedCouponCode}
                    onChange={(e) => setSelectedCouponCode(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs border rounded-xl outline-none uppercase"
                  />
                  <button type="submit" className="px-3.5 py-2 bg-stone-900 text-white rounded-xl text-xs font-bold">
                    Apply
                  </button>
                </form>
                {couponError && <p className="text-rose-500 text-[11px] mt-1">{couponError}</p>}
                {appliedCoupon && <p className="text-emerald-600 text-[11px] mt-1 font-bold">✓ Coupon {appliedCoupon.code} applied (-₹{discountAmount})</p>}
              </div>

              {/* Customer Information Form */}
              <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-stone-200 space-y-2 text-xs">
                <h3 className="font-bold text-stone-800">Delivery Information</h3>
                <input type="text" placeholder="Full Name *" value={checkoutName} onChange={(e) => setCheckoutName(e.target.value)} className="w-full px-3 py-2 border rounded-xl outline-none" />
                <input type="tel" placeholder="Mobile Number *" value={checkoutPhone} onChange={(e) => setCheckoutPhone(e.target.value)} className="w-full px-3 py-2 border rounded-xl outline-none" />
                <textarea placeholder="Delivery Address *" value={checkoutAddress} onChange={(e) => setCheckoutAddress(e.target.value)} className="w-full px-3 py-2 border rounded-xl outline-none" rows="2"></textarea>

                {/* Payment Selector (owner-configured methods; canonical values stored) */}
                <div>
                  <label className="font-bold block mb-1">Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {siteInfo.paymentMethods.map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`py-2 px-1.5 text-[10px] sm:text-[11px] font-bold rounded-xl border ${activePaymentMethod === m ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 border-stone-200'}`}
                      >
                        {m === 'UPI' ? (siteInfo.upiId ? `UPI Instant (${siteInfo.upiId})` : 'UPI Instant') : 'Cash on Delivery (COD)'}
                      </button>
                    ))}
                  </div>
                </div>

                {isUpiPayment && siteInfo.upiId && (
                  <div className="bg-stone-50 border border-stone-200 p-2.5 rounded-xl text-center space-y-1">
                    <p className="text-[11px] font-bold text-stone-700">Scan & Pay via UPI: <span className="text-amber-800">{siteInfo.upiId}</span></p>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=upi://pay?pa=${encodeURIComponent(siteInfo.upiId)}%26pn=${encodeURIComponent(siteInfo.brandName)}%26am=${encodeURIComponent(grandTotal)}`}
                      alt="UPI QR Code"
                      className="w-24 h-24 mx-auto border rounded-lg p-1 bg-white"
                    />
                    <p className="text-[10px] text-stone-500 leading-snug">Pay {`₹${grandTotal}`} after placing the order. Payment is confirmed by the restaurant once verified.</p>
                  </div>
                )}
              </div>

              {/* Order summary + place order */}
              <div className="bg-stone-900 text-white p-3.5 sm:p-4 rounded-2xl shadow-lg space-y-2">
                <div className="flex justify-between text-[11px] text-stone-300"><span>Subtotal</span><span>₹{subtotal}</span></div>
                {discountAmount > 0 && <div className="flex justify-between text-[11px] text-emerald-400"><span>Discount</span><span>-₹{discountAmount}</span></div>}
                {gstAmount > 0 && <div className="flex justify-between text-[11px] text-stone-300"><span>GST</span><span>₹{gstAmount}</span></div>}
                <div className="flex justify-between text-[11px] text-stone-300"><span>Delivery</span><span>{deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}</span></div>
                <div className="flex justify-between items-center pt-2 border-t border-white/10">
                  <span className="text-[11px] text-stone-400">Grand Total</span>
                  <span className="text-lg sm:text-xl font-black text-amber-400">₹{grandTotal}</span>
                </div>
                <button
                  onClick={handleProceedOrder}
                  disabled={isPlacingOrder || !isSupabaseConfigured || !supabaseReady}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>{isPlacingOrder ? 'Placing order…' : 'Place Order'}</span>
                </button>
                {(!isSupabaseConfigured || !supabaseReady) && (
                  <p className="text-[10px] text-amber-300 text-center">Checkout is temporarily unavailable while the ordering system reconnects.</p>
                )}
                {totals.deliveryMode === 'distance' && !totals.deliveryOk && (
                  <p className="text-[10px] text-amber-300 text-center">Delivery charge is confirmed by the kitchen from your verified location.</p>
                )}
              </div>
            </div>
          )}
        </main>
      )}

      {/* VIEW: MY ORDERS */}
      {activeTab === 'orders' && (
        <OrdersView
          orders={customerOrders}
          currentUser={currentUser}
          loading={ordersLoading}
          error={ordersError}
          onRefresh={refreshCustomerOrders}
          onLogin={() => { setShowAuthModal(true); setAuthErrorMsg(''); }}
          onViewInvoice={(o) => setLatestCompletedOrder(o)}
          menuById={menuById}
        />
      )}

      {/* Footer (shown on all views) */}
      <Footer onNavigate={goToSection} />

      {/* INVOICE MODAL (professional, print-ready, escaped download) */}
      {latestCompletedOrder && (
        <InvoiceModal
          order={latestCompletedOrder}
          info={invoiceInfo}
          onClose={() => setLatestCompletedOrder(null)}
        />
      )}

      {/* RESPONSIVE AUTH MODAL */}
      {showAuthModal && (
        <AuthScreen
          authAction={authAction}
          setAuthAction={setAuthAction}
          inputUser={inputUser}
          setInputUser={setInputUser}
          inputPass={inputPass}
          setInputPass={setInputPass}
          inputName={inputName}
          setInputName={setInputName}
          inputPhone={inputPhone}
          setInputPhone={setInputPhone}
          authErrorMsg={authErrorMsg}
          isAuthenticating={isAuthenticating}
          rememberMe={rememberMe}
          setRememberMe={setRememberMe}
          onClose={() => setShowAuthModal(false)}
          onSubmit={handleAuthSubmit}
          onStaffPortal={() => { setShowAuthModal(false); navigate('/admin/login'); }}
        />
      )}
      </div>
    </SiteSettingsContext.Provider>
  );
}

export default App;
