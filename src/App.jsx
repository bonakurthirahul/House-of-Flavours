import { useState, useEffect, useMemo } from 'react';
import { SHEETDB_URL, UPI_ID, INITIAL_COUPONS } from './constants.js';
import { COMPLETE_DEFAULT_CATALOG, QUICK_UPSELL_ITEMS, mergeMenuSeed, DISH_CATEGORIES } from './data/catalog.js';
import { siteConfig } from './config.js';
import { useLocalStorage } from './hooks/useLocalStorage.js';
import { isSupabaseConfigured } from './lib/supabase.js';
import { registerCustomer, loginCustomer, loginStaff, logout as supabaseLogout, restoreSession, onSupabaseAuthChange } from './lib/authService.js';
import { isSchemaReady, loadMenuFromDb, syncCatalogToDb, upsertMenuItem, setAvailability, loadOrdersFromDb, placeOrderToDb, updateOrderStatus } from './lib/dbService.js';
import { Plus, Minus, MessageCircle, Download, RefreshCw, Check } from './components/icons.jsx';
import { BrandLogo } from './components/BrandLogo.jsx';
import { Navbar } from './components/Navbar.jsx';
import { Hero } from './components/Hero.jsx';
import { About } from './components/About.jsx';
import { MenuSection } from './components/MenuSection.jsx';
import { Reviews } from './components/Reviews.jsx';
import { Contact } from './components/Contact.jsx';
import { Footer } from './components/Footer.jsx';
import { AuthScreen } from './components/AuthScreen.jsx';

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [pendingSection, setPendingSection] = useState(null);
  const [currentUser, setCurrentUser] = useLocalStorage('rahulfoods_active_user_session_v9', null);
  const [isStoreOpen, setIsStoreOpen] = useLocalStorage('rahulfoods_store_open_v9', true);

  const [menuItems, setMenuItems] = useLocalStorage('rahulfoods_fresh_2026_catalog_v9', COMPLETE_DEFAULT_CATALOG);
  const [cart, setCart] = useLocalStorage('rahulfoods_active_cart_v9', []);
  const [orders, setOrders] = useLocalStorage('rahulfoods_active_orders_v9', []);
  const [coupons, setCoupons] = useLocalStorage('rahulfoods_active_coupons_v9', INITIAL_COUPONS);

  // Staff Portal Sub-navigation & Sync
  const [staffTab, setStaffTab] = useState('live_orders'); // 'live_orders' | 'menu_editor' | 'coupons'
  const [liveSheetOrders, setLiveSheetOrders] = useState([]);
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);

  const [selectedCouponCode, setSelectedCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Dishes');

  const [checkoutName, setCheckoutName] = useState('');
  const [checkoutPhone, setCheckoutPhone] = useState('');
  const [checkoutAddress, setCheckoutAddress] = useState('');
  const [cookingInstructions, setCookingInstructions] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('UPI Instant (9948099296@fam)');
  const [latestCompletedOrder, setLatestCompletedOrder] = useState(null);

  // Clean Auth Modal States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('customer'); // 'customer' | 'staff'
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
  const [dbOrders, setDbOrders] = useState([]);
  const [dbCustomerOrders, setDbCustomerOrders] = useState([]);
  const [savingToDb, setSavingToDb] = useState(false);
  const [dbSaveMessage, setDbSaveMessage] = useState('');

  // Menu Editor Edit State
  const [editingDish, setEditingDish] = useState(null);
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponDiscount, setNewCouponDiscount] = useState('');
  const [newCouponMin, setNewCouponMin] = useState('');

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

  const fetchSheetOrders = async () => {
    setIsFetchingSheet(true);
    try {
      const res = await fetch(SHEETDB_URL);
      const data = await res.json();
      if (Array.isArray(data)) {
        setLiveSheetOrders(data.reverse());
      }
    } catch (err) {
      console.error("SheetDB fetch error:", err);
    } finally {
      setIsFetchingSheet(false);
    }
  };

  useEffect(() => {
    if (currentUser && currentUser.role === 'staff' && activeTab === 'admin_portal') {
      if (isSupabaseConfigured && supabaseReady) {
        fetchDbOrders();
      } else {
        fetchSheetOrders();
      }
    }
  }, [currentUser, activeTab, supabaseReady]);

  const fetchDbOrders = async () => {
    try {
      const rows = await loadOrdersFromDb();
      setDbOrders(rows || []);
    } catch (err) {
      setDbNotice('Could not load orders: ' + err.message);
    }
  };

  const mapOrderRow = (o) => ({
    orderId: o.order_id,
    timestamp: new Date(o.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    customer: { name: o.customer_name, phone: o.phone, address: o.address, instructions: o.instructions || '' },
    items: (o.order_items || []).map((li) => ({ name: li.name, quantity: li.quantity, price: Number(li.price) })),
    subtotal: Number(o.subtotal),
    discountAmount: Number(o.discount),
    gstAmount: Number(o.gst),
    deliveryFee: Number(o.delivery_fee),
    grandTotal: Number(o.total),
    paymentMethod: o.payment_method,
    status: o.status,
    source: 'supabase'
  });

  const handleSyncMenuToDb = async () => {
    if (!isSupabaseConfigured || !supabaseReady) return;
    setSavingToDb(true);
    setDbSaveMessage('');
    try {
      await syncCatalogToDb(DISH_CATEGORIES, menuItems);
      setDbSaveMessage('Menu synced to database.');
      const dbm = await loadMenuFromDb();
      if (dbm.items.length) setMenuItems(dbm.items);
    } catch (err) {
      setDbSaveMessage('Sync failed: ' + err.message);
    } finally {
      setSavingToDb(false);
    }
  };

  const handleToggleAvailability = async (dish) => {
    const next = { ...dish, isAvailable: !dish.isAvailable };
    setMenuItems(menuItems.map((d) => (d.id === dish.id ? next : d)));
    if (isSupabaseConfigured && supabaseReady) {
      try {
        await setAvailability(dish.id, next.isAvailable);
      } catch (err) {
        setDbNotice('Could not save availability: ' + err.message);
        setMenuItems(menuItems.map((d) => (d.id === dish.id ? { ...d, isAvailable: dish.isAvailable } : d)));
      }
    }
  };

  const handleSaveDish = async () => {
    if (!editingDish) return;
    if (!editingDish.name || !editingDish.category || editingDish.price < 0) {
      setDbSaveMessage('Name, category and a valid price are required.');
      return;
    }
    const saved = menuItems.some((d) => d.id === editingDish.id);
    if (isSupabaseConfigured && supabaseReady) {
      setSavingToDb(true);
      setDbSaveMessage('');
      try {
        await upsertMenuItem(editingDish);
        setDbSaveMessage(saved ? 'Changes saved to database.' : 'New item added to the database.');
      } catch (err) {
        setDbSaveMessage('Save failed: ' + err.message);
        setSavingToDb(false);
        return;
      }
      setSavingToDb(false);
    }
    setMenuItems(
      saved
        ? menuItems.map((d) => (d.id === editingDish.id ? editingDish : d))
        : [...menuItems, editingDish]
    );
    setEditingDish(null);
  };

  const handleUpdateOrderStatus = async (orderId, status) => {
    if (!isSupabaseConfigured || !supabaseReady) return;
    try {
      await updateOrderStatus(orderId, status);
      fetchDbOrders();
    } catch (err) {
      setDbNotice('Could not update status: ' + err.message);
    }
  };

  // Sheet-Powered Authentication & Automatic User Logging into Google Sheet
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthErrorMsg('');
    setIsAuthenticating(true);

    const cleanUser = inputUser.trim();
    const cleanPass = inputPass.trim();

    // ---- SUPABASE AUTH PATH (primary when VITE_SUPABASE_* env vars exist) ----
    if (isSupabaseConfigured) {
      try {
        if (authMode === 'staff') {
          const res = await loginStaff(cleanUser, cleanPass);
          if (!res.ok) {
            setAuthErrorMsg(res.error);
            return;
          }
          setCurrentUser({ ...res.user, role: res.user.role === 'manager' ? 'staff' : res.user.role });
          setShowAuthModal(false);
          setInputUser('');
          setInputPass('');
          setActiveTab('admin_portal');
          window.scrollTo({ top: 0 });
          return;
        }

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
      return;
    }

    // ---- LEGACY SHEET / LOCALSTORAGE PATH (fallback when Supabase is not configured) ----

    try {
      let sheetUsers = [];
      try {
        const res = await fetch(SHEETDB_URL);
        const data = await res.json();
        if (Array.isArray(data)) sheetUsers = data;
      } catch (netErr) {
        console.warn("SheetDB fetch fallback:", netErr);
      }

      // STAFF AUTHENTICATION
      if (authMode === 'staff') {
        const sheetStaff = sheetUsers.find(
          u => u.username && u.username.toUpperCase() === cleanUser.toUpperCase() &&
               u.password === cleanPass &&
               (u.role && u.role.toLowerCase() === 'staff')
        );

        if (sheetStaff || (cleanUser.toUpperCase() === 'RAHUL' && cleanPass === 'RAHUL@123')) {
          const staffSession = {
            username: cleanUser.toUpperCase(),
            role: 'staff',
            name: sheetStaff?.name || 'Kitchen Manager'
          };
          setCurrentUser(staffSession);
          setShowAuthModal(false);
          setInputUser('');
          setInputPass('');
          setActiveTab('admin_portal');
          setIsAuthenticating(false);
          return;
        } else {
          setAuthErrorMsg('Access Denied: Invalid credentials.');
          setIsAuthenticating(false);
          return;
        }
      }

      // CUSTOMER AUTHENTICATION
      if (authAction === 'login') {
        const sheetCustomer = sheetUsers.find(
          u => u.username && u.username.toLowerCase() === cleanUser.toLowerCase() &&
               u.password === cleanPass
        );

        const storedLocal = JSON.parse(localStorage.getItem('rahulfoods_customer_accounts_v9') || '[]');
        const localCustomer = storedLocal.find(
          u => u.username && u.username.toLowerCase() === cleanUser.toLowerCase() && u.password === cleanPass
        );

        const verifiedCust = sheetCustomer || localCustomer;

        if (verifiedCust) {
          setCurrentUser(verifiedCust);
          setShowAuthModal(false);
          setInputUser('');
          setInputPass('');
          try {
            if (rememberMe) localStorage.setItem('rahulfoods_remember_user_v9', cleanUser);
            else localStorage.removeItem('rahulfoods_remember_user_v9');
          } catch (rmErr) {
            console.warn('Remember-me save failed:', rmErr);
          }
        } else {
          setAuthErrorMsg('Incorrect credentials. Please verify your username and password.');
        }
      } else {
        // CUSTOMER REGISTRATION - POSTS DIRECTLY TO GOOGLE SHEET
        if (!cleanUser || !cleanPass || !inputPhone.trim()) {
          setAuthErrorMsg('Please fill all mandatory fields.');
          setIsAuthenticating(false);
          return;
        }

        const storedLocal = JSON.parse(localStorage.getItem('rahulfoods_customer_accounts_v9') || '[]');
        if (storedLocal.some(u => u.username.toLowerCase() === cleanUser.toLowerCase())) {
          setAuthErrorMsg('This username is already taken. Please choose another.');
          setIsAuthenticating(false);
          return;
        }

        const newCust = {
          username: cleanUser,
          password: cleanPass,
          role: 'customer',
          name: inputName.trim() || cleanUser,
          phone: inputPhone.trim(),
          registered_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        };

        // Post new user row to SheetDB / Google Sheet
        fetch(SHEETDB_URL, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: [{
              order_id: `USER-REG-${Date.now().toString().slice(-4)}`,
              timestamp: newCust.registered_at,
              customer_name: newCust.name,
              phone: newCust.phone,
              address: 'Account Registration',
              items: `New Account: @${newCust.username}`,
              total: 0,
              payment_mode: 'REGISTRATION',
              instructions: `Password: ${newCust.password} | Role: customer`,
              username: newCust.username,
              password: newCust.password,
              role: 'customer',
              name: newCust.name
            }]
          })
        }).catch(err => console.error("Sheet registration sync error:", err));

        // Persist locally
        storedLocal.push(newCust);
        localStorage.setItem('rahulfoods_customer_accounts_v9', JSON.stringify(storedLocal));

        setCurrentUser(newCust);
        setShowAuthModal(false);
        setInputUser('');
        setInputPass('');
        setInputName('');
        setInputPhone('');
        try {
          if (rememberMe) localStorage.setItem('rahulfoods_remember_user_v9', cleanUser);
          else localStorage.removeItem('rahulfoods_remember_user_v9');
        } catch (rmErr) {
          console.warn('Remember-me save failed:', rmErr);
        }
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
  const deliveryFee = subtotal >= 499 || subtotal === 0 ? 0 : 35;
  const gstAmount = Math.round(subtotal * 0.05);

  const discountAmount = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (subtotal < appliedCoupon.minOrder) return 0;
    return appliedCoupon.type === 'percent'
      ? Math.round((subtotal * appliedCoupon.discount) / 100)
      : appliedCoupon.discount;
  }, [appliedCoupon, subtotal]);

  const grandTotal = Math.max(0, subtotal + deliveryFee + (subtotal > 0 ? gstAmount : 0) - discountAmount);
  const totalCartCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);

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
    if (!isStoreOpen) {
      alert("The kitchen is currently closed. We are not accepting orders right now.");
      return;
    }
    if (cart.length === 0) return;
    if (!checkoutName.trim() || !checkoutPhone.trim() || !checkoutAddress.trim()) {
      alert('Please enter Name, Phone Number, and Delivery Address.');
      return;
    }

    // ---- SUPABASE ORDER PATH (transactional, server-side pricing) ----
    if (isSupabaseConfigured && supabaseReady) {
      const orderId = `RF-${Date.now().toString().slice(-5)}`;
      const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      try {
        const placed = await placeOrderToDb({
          orderId,
          customerName: checkoutName.trim(),
          phone: checkoutPhone.trim(),
          address: checkoutAddress,
          instructions: cookingInstructions,
          paymentMethod,
          discount: discountAmount,
          items: cart.map((i) => ({
            ...i,
            // Only genuine DB menu items carry a menu_id; extras are priced client-side (clamped in DB).
            menuId: menuItems.some((d) => d.id === i.id) ? i.id : null
          }))
        });
        const newOrder = {
          orderId: placed.order_id,
          timestamp,
          userId: currentUser ? currentUser.username || 'guest' : 'guest',
          customer: { name: checkoutName.trim(), phone: checkoutPhone.trim(), address: checkoutAddress, instructions: cookingInstructions },
          items: [...cart],
          subtotal: Number(placed.subtotal),
          discountAmount: Number(placed.discount),
          gstAmount: Number(placed.gst),
          deliveryFee: Number(placed.delivery_fee),
          grandTotal: Number(placed.total),
          paymentMethod,
          status: 'Order Received',
          source: 'supabase'
        };
        setOrders([newOrder, ...orders]);
        setLatestCompletedOrder(newOrder);
        if (currentUser?.role === 'staff') setDbOrders((prev) => [newOrder, ...prev]);

        const itemsSummary = cart.map(i => `${i.name} (x${i.quantity})`).join(', ');
        let message = `🍽️ *NEW ORDER - HOUSE OF FLAVOURS* 🍽️\n📋 *Order ID:* #${orderId}\n⏰ *Time:* ${timestamp}\n\n👤 *CUSTOMER:*\n• ${checkoutName} (${checkoutPhone})\n• ${checkoutAddress}\n`;
        if (cookingInstructions.trim()) message += `• Note: "${cookingInstructions}"\n`;
        message += `\n📦 *ITEMS:*\n${itemsSummary}\n\n💳 *TOTAL PAYABLE:* ₹${newOrder.grandTotal} (${paymentMethod})`;
        window.open(`https://wa.me/919948099296?text=${encodeURIComponent(message)}`, '_blank');
        setCart([]);
      } catch (err) {
        setDbNotice('Order could not be saved: ' + err.message + ' Your cart was kept; please retry.');
      }
      return;
    }

    const orderId = `RF-${Date.now().toString().slice(-5)}`;
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const itemsSummary = cart.map(i => `${i.name} (x${i.quantity})`).join(', ');

    const newOrder = {
      orderId,
      timestamp,
      userId: currentUser ? currentUser.username : 'guest',
      customer: { name: checkoutName, phone: checkoutPhone, address: checkoutAddress, instructions: cookingInstructions },
      items: [...cart],
      subtotal,
      discountAmount,
      gstAmount,
      deliveryFee,
      grandTotal,
      paymentMethod,
      status: 'Order Received'
    };

    setOrders([newOrder, ...orders]);
    setLatestCompletedOrder(newOrder);

    // SheetDB integration - Push Order
    fetch(SHEETDB_URL, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [{
          order_id: orderId,
          timestamp,
          customer_name: checkoutName.trim(),
          phone: checkoutPhone.trim(),
          address: checkoutAddress,
          items: itemsSummary,
          total: grandTotal,
          payment_mode: paymentMethod,
          instructions: cookingInstructions.trim() || 'None'
        }]
      })
    }).then(() => fetchSheetOrders()).catch(err => console.error("SheetDB error:", err));

    // WhatsApp message trigger
    let message = `🍽️ *NEW ORDER - HOUSE OF FLAVOURS* 🍽️\n📋 *Order ID:* #${orderId}\n⏰ *Time:* ${timestamp}\n\n👤 *CUSTOMER:*\n• ${checkoutName} (${checkoutPhone})\n• ${checkoutAddress}\n`;
    if (cookingInstructions.trim()) message += `• Note: "${cookingInstructions}"\n`;
    message += `\n📦 *ITEMS:*\n`;
    cart.forEach((it, idx) => {
      message += `${idx + 1}. ${it.name} [x${it.quantity}] - ₹${it.price * it.quantity}\n`;
    });
    message += `\n💳 *TOTAL PAYABLE:* ₹${grandTotal} (${paymentMethod})`;

    window.open(`https://wa.me/919948099296?text=${encodeURIComponent(message)}`, '_blank');
    setCart([]);
  };

  // Download Invoice Action (HTML/PDF format)
  const downloadInvoiceFile = (order) => {
    const invoiceContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice #${order.orderId} - House of Flavours</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 30px; max-width: 600px; margin: 0 auto; color: #1c1917; }
    .header { text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 20px; }
    .title { font-size: 24px; font-weight: 900; color: #b45309; margin: 0; }
    .meta { font-size: 13px; color: #78716c; margin-top: 5px; }
    .details { margin: 20px 0; font-size: 14px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
    th { text-align: left; padding: 10px; background: #f5f5f4; border-bottom: 1px solid #e7e5e4; }
    td { padding: 10px; border-bottom: 1px solid #f5f5f4; }
    .total-box { text-align: right; margin-top: 15px; font-size: 14px; }
    .grand { font-size: 20px; font-weight: 900; color: #b45309; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #a8a29e; }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="title">HOUSE OF FLAVOURS</h1>
    <div class="meta">Authentic Hyderabadi Dum Biryani & Kebabs</div>
    <div class="meta">Tax Invoice / Receipt: #${order.orderId} | ${order.timestamp}</div>
  </div>
  <div class="details">
    <strong>Customer:</strong> ${order.customer?.name}<br>
    <strong>Phone:</strong> ${order.customer?.phone}<br>
    <strong>Delivery Address:</strong> ${order.customer?.address}<br>
    <strong>Payment:</strong> ${order.paymentMethod}
  </div>
  <table>
    <thead><tr><th>Item</th><th>Qty</th><th style="text-align:right">Price</th></tr></thead>
    <tbody>
      ${order.items.map(it => `<tr><td>${it.name}</td><td>${it.quantity}</td><td style="text-align:right">₹${it.price * it.quantity}</td></tr>`).join('')}
    </tbody>
  </table>
  <div class="total-box">
    <div>Subtotal: ₹${order.subtotal}</div>
    ${order.discountAmount > 0 ? `<div style="color: green">Discount: -₹${order.discountAmount}</div>` : ''}
    <div>GST (5%): ₹${order.gstAmount}</div>
    <div>Delivery Fee: ${order.deliveryFee === 0 ? 'FREE' : `₹${order.deliveryFee}`}</div>
    <div class="grand">Grand Total: ₹${order.grandTotal}</div>
  </div>
  <div class="footer">
    Thank you for ordering with House of Flavours! For queries: WhatsApp ${siteConfig.phone}
  </div>
</body>
</html>`;

    const blob = new Blob([invoiceContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HouseOfFlavours_Invoice_${order.orderId}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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

  // Customer: load their own persisted orders from Supabase (RLS returns only their rows).
  useEffect(() => {
    if (activeTab === 'orders' && isSupabaseConfigured && supabaseReady && currentUser) {
      loadOrdersFromDb()
        .then((rows) => setDbCustomerOrders(rows || []))
        .catch(() => {});
    }
  }, [activeTab, isSupabaseConfigured, supabaseReady, currentUser]);

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

  return (
    <div className="min-h-screen flex flex-col bg-night-950 text-cream-100">

      {/* Header / Navigation */}
      <Navbar
        onNavigate={goToSection}
        onOrderNow={() => goToSection('menu')}
        onOpenCart={() => { setActiveTab('cart'); window.scrollTo({ top: 0 }); }}
        onOpenOrders={() => { setActiveTab('orders'); window.scrollTo({ top: 0 }); }}
        onLogin={() => { setShowAuthModal(true); setAuthErrorMsg(''); }}
        onLogout={handleLogout}
        onOpenStaff={() => { setActiveTab('admin_portal'); window.scrollTo({ top: 0 }); }}
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
          <Reviews />
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
                <input type="tel" placeholder="WhatsApp Number *" value={checkoutPhone} onChange={(e) => setCheckoutPhone(e.target.value)} className="w-full px-3 py-2 border rounded-xl outline-none" />
                <textarea placeholder="Delivery Address *" value={checkoutAddress} onChange={(e) => setCheckoutAddress(e.target.value)} className="w-full px-3 py-2 border rounded-xl outline-none" rows="2"></textarea>

                {/* Payment Selector */}
                <div>
                  <label className="font-bold block mb-1">Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['UPI Instant (9948099296@fam)', 'Cash on Delivery (COD)'].map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`py-2 px-1.5 text-[10px] sm:text-[11px] font-bold rounded-xl border ${paymentMethod === m ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 border-stone-200'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {paymentMethod.startsWith('UPI') && (
                  <div className="bg-stone-50 border border-stone-200 p-2.5 rounded-xl text-center space-y-1">
                    <p className="text-[11px] font-bold text-stone-700">Scan & Pay via UPI: <span className="text-amber-800">{UPI_ID}</span></p>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=upi://pay?pa=${UPI_ID}%26pn=RAHUL%20FOODS%26am=${grandTotal}`}
                      alt="UPI QR Code"
                      className="w-24 h-24 mx-auto border rounded-lg p-1 bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Final Calculation */}
              <div className="bg-stone-900 text-white p-3.5 sm:p-4 rounded-2xl flex justify-between items-center shadow-lg">
                <div>
                  <div className="text-[10px] sm:text-[11px] text-stone-400">Grand Total</div>
                  <div className="text-lg sm:text-xl font-black text-amber-400">₹{grandTotal}</div>
                </div>
                <button onClick={handleProceedOrder} className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md">
                  <MessageCircle className="w-4 h-4 fill-white" />
                  <span>Order on WhatsApp</span>
                </button>
              </div>
            </div>
          )}
        </main>
      )}

      {/* VIEW: MY ORDERS */}
      {activeTab === 'orders' && (
        <main className="flex-1 max-w-2xl w-full mx-auto p-3.5 sm:p-6 bg-stone-100 text-stone-900">
          <div className="flex justify-between items-center mb-3 sm:mb-4">
            <h2 className="text-lg sm:text-xl font-black">Order History</h2>
            {!currentUser && (
              <button onClick={() => setShowAuthModal(true)} className="text-xs font-bold text-amber-700 underline">
                Log in for personal history
              </button>
            )}
          </div>

          {customerOrders.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl text-center text-xs text-stone-400 border border-stone-200">
              {currentUser
                ? `No past orders recorded for ${currentUser.name}.`
                : 'Log in to view your orders.'}
            </div>
          ) : (
            <div className="space-y-3">
              {customerOrders.map((o) => (
                <div key={o.orderId} className="bg-white p-3.5 sm:p-4 rounded-2xl border border-stone-200 text-xs shadow-xs">
                  <div className="flex justify-between items-center font-bold mb-1">
                    <span className="text-amber-800">#{o.orderId}</span>
                    <span className="text-sm font-black">₹{o.grandTotal}</span>
                  </div>
                  <div className="text-stone-400 text-[10px] mb-2">{o.timestamp}</div>
                  <div className="text-stone-700 leading-relaxed">{o.items.map(it => `${it.name} (x${it.quantity})`).join(', ')}</div>
                  <div className="mt-2.5 pt-2 border-t border-stone-100 flex justify-between items-center text-[11px]">
                    <span className="text-emerald-700 font-bold">{o.status}</span>
                    <button onClick={() => setLatestCompletedOrder(o)} className="text-amber-700 font-bold underline flex items-center gap-1">
                      <Download className="w-3 h-3" /> Invoice
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {/* VIEW: KITCHEN STAFF DASHBOARD (FULL FEATURES RESTORED) */}
      {activeTab === 'admin_portal' && currentUser?.role === 'staff' && (
        <main className="flex-1 max-w-6xl w-full mx-auto p-3.5 sm:p-6 bg-stone-100 text-stone-900">

          {/* Kitchen Header with Master Toggle */}
          <div className="bg-purple-950 text-white p-4 sm:p-6 rounded-3xl mb-4 sm:mb-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <BrandLogo className="w-8 h-8" />
                <span className="bg-purple-800 text-purple-200 text-xs px-2.5 py-0.5 rounded-full font-bold">Kitchen Ops</span>
                {isSupabaseConfigured && supabaseReady ? (
                  <span className="text-emerald-400 text-xs flex items-center gap-1">● Database Synced</span>
                ) : (
                  <span className="text-emerald-400 text-xs flex items-center gap-1">● Live Sheet Synced</span>
                )}
              </div>
              <h2 className="text-xl font-black">Manager Control Center</h2>
              <p className="text-xs text-purple-300">Logged in as {currentUser.name}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsStoreOpen(!isStoreOpen)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${isStoreOpen ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-rose-600 hover:bg-rose-700 text-white'}`}
              >
                <span>Store: {isStoreOpen ? 'OPEN' : 'CLOSED'}</span>
              </button>

              {isSupabaseConfigured && supabaseReady ? (
                <>
                  <button
                    onClick={handleSyncMenuToDb}
                    disabled={savingToDb}
                    className="px-3 py-1.5 bg-purple-800 hover:bg-purple-700 rounded-xl text-xs font-bold flex items-center gap-1 text-white disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${savingToDb ? 'animate-spin' : ''}`} />
                    <span>Sync Menu &amp; DB</span>
                  </button>
                  <button
                    onClick={fetchDbOrders}
                    className="px-3 py-1.5 bg-stone-900 hover:bg-black rounded-xl text-xs font-bold flex items-center gap-1 text-white"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Refresh Orders</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={fetchSheetOrders}
                  className="px-3 py-1.5 bg-purple-800 hover:bg-purple-700 rounded-xl text-xs font-bold flex items-center gap-1 text-white"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFetchingSheet ? 'animate-spin' : ''}`} />
                  <span>Sync Sheet</span>
                </button>
              )}

              {dbSaveMessage && (
                <span className="text-emerald-400 text-[11px] font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> {dbSaveMessage}
                </span>
              )}

              <button onClick={handleLogout} className="px-3 py-1.5 bg-stone-900 hover:bg-black rounded-xl text-xs font-bold text-white">
                Sign Out
              </button>
            </div>
          </div>

          {/* Staff Sub-Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 no-scrollbar">
            <button
              onClick={() => setStaffTab('live_orders')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${staffTab === 'live_orders' ? 'bg-purple-900 text-white' : 'bg-white border text-stone-700'}`}
            >
              Live Orders ({isSupabaseConfigured && supabaseReady ? dbOrders.length : liveSheetOrders.length})
            </button>
            <button
              onClick={() => setStaffTab('menu_editor')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${staffTab === 'menu_editor' ? 'bg-purple-900 text-white' : 'bg-white border text-stone-700'}`}
            >
              Menu Item Editor ({menuItems.length})
            </button>
            <button
              onClick={() => setStaffTab('coupons')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${staffTab === 'coupons' ? 'bg-purple-900 text-white' : 'bg-white border text-stone-700'}`}
            >
              Coupons & Discounts ({coupons.length})
            </button>
          </div>

          {/* TAB 1: LIVE ORDERS QUEUE */}
          {staffTab === 'live_orders' && (
            <div className="space-y-3">
              {isSupabaseConfigured && supabaseReady ? (
                dbOrders.length === 0 ? (
                  <div className="bg-white p-8 rounded-2xl text-center text-xs text-stone-400">No orders in the database yet.</div>
                ) : (
                  dbOrders.map((ord) => {
                    const o = mapOrderRow(ord);
                    return (
                      <div key={o.orderId} className="bg-white p-3.5 sm:p-4 rounded-2xl border border-stone-200 text-xs shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-black text-sm">#{o.orderId}</span>
                            <span className="text-stone-400 text-[10px]">{o.timestamp}</span>
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[9px]">{o.paymentMethod}</span>
                            <span className={`px-2 py-0.5 rounded font-bold text-[9px] ${o.status === 'Order Received' ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800'}`}>{o.status}</span>
                          </div>
                          <div className="font-semibold text-stone-800">{o.customer.name} • <span className="text-amber-700 font-bold">{o.customer.phone}</span></div>
                          <div className="text-stone-500 text-[11px] mt-0.5">{o.customer.address}</div>
                          {o.customer.instructions && (
                            <div className="text-amber-800 font-semibold text-[11px] mt-0.5">Note: "{o.customer.instructions}"</div>
                          )}
                          <div className="text-stone-700 mt-1">Items: {o.items.map(it => `${it.name} (x${it.quantity})`).join(', ')}</div>
                        </div>

                        <div className="flex md:flex-col items-center md:items-end justify-between border-t md:border-t-0 pt-2 md:pt-0 gap-2">
                          <div className="text-base font-black text-amber-700">₹{o.grandTotal}</div>
                          <div className="flex items-center gap-2">
                            <select
                              value={o.status}
                              onChange={(ev) => handleUpdateOrderStatus(o.orderId, ev.target.value)}
                              className="px-2 py-1 rounded-lg border text-[10px] font-bold bg-white"
                              aria-label={`Status for ${o.orderId}`}
                            >
                              {['Order Received', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'].map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                            <a
                              href={`https://wa.me/91${(o.customer.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${o.customer.name}, your House of Flavours order #${o.orderId} is ${o.status.toLowerCase()}.`)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-[10px] font-bold"
                            >
                              WhatsApp
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                <>
                  {isFetchingSheet && liveSheetOrders.length === 0 ? (
                    <div className="bg-white p-8 rounded-2xl text-center text-xs text-stone-400">Syncing orders directly from Google Sheet...</div>
                  ) : liveSheetOrders.length === 0 ? (
                    <div className="bg-white p-8 rounded-2xl text-center text-xs text-stone-400">No orders logged in Google Sheet yet.</div>
                  ) : (
                    liveSheetOrders.map((ord, idx) => (
                      <div key={idx} className="bg-white p-3.5 sm:p-4 rounded-2xl border border-stone-200 text-xs shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-black text-sm">#{ord.order_id || 'RF-ORDER'}</span>
                            <span className="text-stone-400 text-[10px]">{ord.timestamp}</span>
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[9px]">{ord.payment_mode || 'COD'}</span>
                          </div>
                          <div className="font-semibold text-stone-800">{ord.customer_name} • <span className="text-amber-700 font-bold">{ord.phone}</span></div>
                          <div className="text-stone-500 text-[11px] mt-0.5">{ord.address}</div>
                          {ord.instructions && ord.instructions !== 'None' && (
                            <div className="text-amber-800 font-semibold text-[11px] mt-0.5">Note: "{ord.instructions}"</div>
                          )}
                          <div className="text-stone-700 mt-1">Dishes: {ord.items}</div>
                        </div>

                        <div className="flex md:flex-col items-center md:items-end justify-between border-t md:border-t-0 pt-2 md:pt-0">
                          <div className="text-base font-black text-amber-700">₹{ord.total}</div>
                          <a
                            href={`https://wa.me/91${(ord.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${ord.customer_name}, your House of Flavours order #${ord.order_id} is being prepared fresh!`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-[10px] font-bold"
                          >
                            WhatsApp Customer
                          </a>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 2: MENU ITEM CRUD EDITOR */}
          {staffTab === 'menu_editor' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[11px] text-stone-500">
                  {isSupabaseConfigured && supabaseReady
                    ? 'Changes are saved to the database immediately.'
                    : 'Changes are saved locally (Supabase not configured).'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingDish({
                      id: `hof_new_${Date.now().toString().slice(-6)}`,
                      name: '',
                      description: '',
                      price: 0,
                      image: '',
                      category: 'Starters',
                      isVeg: true,
                      isAvailable: true
                    })}
                    className="px-3.5 py-1.5 bg-purple-900 text-white rounded-xl text-xs font-bold"
                  >
                    + Add New Item
                  </button>
                  {isSupabaseConfigured && supabaseReady && (
                    <button
                      onClick={handleSyncMenuToDb}
                      disabled={savingToDb}
                      className="px-3.5 py-1.5 bg-stone-900 text-white rounded-xl text-xs font-bold disabled:opacity-60"
                    >
                      {savingToDb ? 'Syncing...' : 'Sync to Database'}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {menuItems.map((dish) => (
                <div key={dish.id} className="bg-white p-3 rounded-2xl border border-stone-200 flex items-center justify-between gap-3 text-xs shadow-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img src={dish.image || '/placeholder.svg'} alt={dish.name} className="w-12 h-12 rounded-xl object-cover shrink-0" onError={(e) => { if (e.currentTarget.src && !e.currentTarget.src.includes('/placeholder.svg')) e.currentTarget.src = '/placeholder.svg'; }} />
                    <div className="min-w-0">
                      <div className="font-bold text-stone-900 leading-snug truncate">{dish.name}</div>
                      <div className="text-stone-500 text-[11px]"><span className={`font-bold ${dish.isVeg ? 'text-emerald-700' : 'text-rose-700'}`}>{dish.isVeg ? 'VEG' : 'NON-VEG'}</span> • {dish.category} • <strong className="text-amber-700">₹{dish.price}</strong></div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleToggleAvailability(dish)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition ${dish.isAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
                    >
                      {dish.isAvailable ? 'In Stock' : 'Sold Out'}
                    </button>
                    <button
                      onClick={() => setEditingDish({ ...dish })}
                      className="px-2 py-1 bg-stone-100 hover:bg-stone-200 rounded-lg text-[10px] font-bold"
                    >
                      Edit Price
                    </button>
                  </div>
                </div>
              ))}
              </div>
            </div>
          )}

          {/* TAB 3: COUPONS MANAGEMENT */}
          {staffTab === 'coupons' && (
            <div className="space-y-4">
              {/* Create New Coupon */}
              <div className="bg-white p-4 rounded-2xl border border-stone-200">
                <h3 className="font-bold text-xs mb-2">Create New Coupon</h3>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input type="text" placeholder="Coupon Code (e.g. EXTRA50)" value={newCouponCode} onChange={(e) => setNewCouponCode(e.target.value)} className="px-3 py-2 text-xs border rounded-xl outline-none flex-1 uppercase" />
                  <input type="number" placeholder="Discount Amount (₹)" value={newCouponDiscount} onChange={(e) => setNewCouponDiscount(e.target.value)} className="px-3 py-2 text-xs border rounded-xl outline-none w-32" />
                  <input type="number" placeholder="Min Order (₹)" value={newCouponMin} onChange={(e) => setNewCouponMin(e.target.value)} className="px-3 py-2 text-xs border rounded-xl outline-none w-32" />
                  <button
                    onClick={() => {
                      if (!newCouponCode.trim() || !newCouponDiscount) return;
                      setCoupons([...coupons, {
                        code: newCouponCode.trim().toUpperCase(),
                        discount: Number(newCouponDiscount),
                        minOrder: Number(newCouponMin) || 0,
                        type: 'flat',
                        active: true
                      }]);
                      setNewCouponCode('');
                      setNewCouponDiscount('');
                      setNewCouponMin('');
                    }}
                    className="px-4 py-2 bg-purple-900 text-white rounded-xl text-xs font-bold"
                  >
                    Add Coupon
                  </button>
                </div>
              </div>

              {/* Active Coupons List */}
              <div className="space-y-2">
                {coupons.map((c) => (
                  <div key={c.code} className="bg-white p-3 rounded-xl border border-stone-200 flex justify-between items-center text-xs">
                    <div>
                      <span className="font-black text-purple-900">{c.code}</span>
                      <span className="text-stone-500 ml-2">₹{c.discount} OFF on orders above ₹{c.minOrder}</span>
                    </div>
                    <button
                      onClick={() => setCoupons(coupons.map(x => x.code === c.code ? { ...x, active: !x.active } : x))}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${c.active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
                    >
                      {c.active ? 'ACTIVE' : 'DISABLED'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      )}

      {/* Footer (shown on all views) */}
      <Footer onNavigate={goToSection} />

      {/* EDIT DISH MODAL */}
      {editingDish && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white p-5 rounded-2xl max-w-md w-full shadow-2xl text-xs max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-sm mb-3">{menuItems.some(d => d.id === editingDish.id) ? `Edit Item: ${editingDish.name}` : 'Add New Menu Item'}</h3>
            <div className="space-y-2.5">
              <div>
                <label className="font-bold block mb-1 text-stone-600">Name *</label>
                <input type="text" value={editingDish.name} onChange={(e) => setEditingDish({ ...editingDish, name: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none" />
              </div>
              <div>
                <label className="font-bold block mb-1 text-stone-600">Description</label>
                <textarea value={editingDish.description || ''} onChange={(e) => setEditingDish({ ...editingDish, description: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none" rows="2"></textarea>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold block mb-1 text-stone-600">Price (₹) *</label>
                  <input type="number" min="0" value={editingDish.price} onChange={(e) => setEditingDish({ ...editingDish, price: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-xl outline-none text-sm font-bold" />
                </div>
                <div>
                  <label className="font-bold block mb-1 text-stone-600">Category *</label>
                  <select value={editingDish.category} onChange={(e) => setEditingDish({ ...editingDish, category: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none bg-white">
                    {DISH_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="font-bold block mb-1 text-stone-600">Image URL</label>
                <input type="text" value={editingDish.image || ''} onChange={(e) => setEditingDish({ ...editingDish, image: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none" placeholder="https://..." />
                {editingDish.image && (
                  <img src={editingDish.image} alt="preview" className="mt-2 h-16 w-full object-cover rounded-xl" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                )}
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 font-bold text-stone-600 cursor-pointer">
                  <input type="checkbox" checked={editingDish.isVeg} onChange={(e) => setEditingDish({ ...editingDish, isVeg: e.target.checked })} className="accent-emerald-600" />
                  Vegetarian
                </label>
                <label className="flex items-center gap-2 font-bold text-stone-600 cursor-pointer">
                  <input type="checkbox" checked={editingDish.isAvailable} onChange={(e) => setEditingDish({ ...editingDish, isAvailable: e.target.checked })} className="accent-purple-700" />
                  Available
                </label>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSaveDish}
                disabled={savingToDb}
                className="flex-1 py-2 bg-purple-900 text-white rounded-xl font-bold disabled:opacity-60"
              >
                {savingToDb ? 'Saving...' : 'Save to Database'}
              </button>
              <button onClick={() => setEditingDish(null)} className="px-3 py-2 bg-stone-100 rounded-xl font-bold text-stone-600">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INVOICE MODAL (WITH DOWNLOAD ACTION) */}
      {latestCompletedOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50">
          <div id="printable-invoice" className="bg-white p-5 sm:p-6 rounded-3xl max-w-md w-full shadow-2xl text-xs max-h-[90vh] overflow-y-auto">
            <div className="text-center border-b pb-3 mb-3">
              <div className="flex justify-center mb-1">
                <BrandLogo className="w-12 h-12" />
              </div>
              <h3 className="text-base sm:text-lg font-black text-stone-900">House of Flavours</h3>
              <p className="text-[11px] text-stone-500">Tax Invoice / Receipt</p>
              <p className="text-[10px] text-stone-400">Order ID: #{latestCompletedOrder.orderId} • {latestCompletedOrder.timestamp}</p>
            </div>

            <div className="mb-3 space-y-1">
              <div><strong>Customer:</strong> {latestCompletedOrder.customer?.name}</div>
              <div><strong>Phone:</strong> {latestCompletedOrder.customer?.phone}</div>
              <div><strong>Address:</strong> {latestCompletedOrder.customer?.address}</div>
            </div>

            <div className="border-y py-2 space-y-1 mb-3">
              {latestCompletedOrder.items.map((i, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{i.name} x{i.quantity}</span>
                  <span>₹{i.price * i.quantity}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-right mb-4">
              <div>Subtotal: ₹{latestCompletedOrder.subtotal}</div>
              {latestCompletedOrder.discountAmount > 0 && <div className="text-emerald-700">Discount: -₹{latestCompletedOrder.discountAmount}</div>}
              <div>GST (5%): ₹{latestCompletedOrder.gstAmount}</div>
              <div className="text-base font-black text-stone-900">Total: ₹{latestCompletedOrder.grandTotal}</div>
              <div className="text-[10px] text-stone-400">Payment: {latestCompletedOrder.paymentMethod}</div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => downloadInvoiceFile(latestCompletedOrder)}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 transition"
              >
                <Download className="w-4 h-4" /> Download Invoice
              </button>
              <button onClick={() => setLatestCompletedOrder(null)} className="px-4 py-2.5 bg-stone-100 text-stone-700 rounded-xl font-bold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESPONSIVE AUTH MODAL */}
      {showAuthModal && (
        <AuthScreen
          authMode={authMode}
          setAuthMode={setAuthMode}
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
        />
      )}
    </div>
  );
}

export default App;
