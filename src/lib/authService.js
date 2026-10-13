import { supabase, isSupabaseConfigured } from './supabase.js';

// Authentication layer built on Supabase Auth.
// Passwords are handled entirely by Supabase Auth (hashed server-side).
// Roles come from trusted DB records (public.staff_roles via the
// current_user_role() security-definer function), never from the browser.

export const HOF_EMAIL_DOMAIN = 'hof.in';

// The app logs users in with a "username". Under the hood every account is an
// email/password Supabase Auth account using the deterministic convention
// `username@hof.in` (unless the user types a full email).
export const toEmail = (identifier) => {
  const id = (identifier || '').trim();
  if (!id) return '';
  if (id.includes('@')) return id.toLowerCase();
  return `${id.toLowerCase().replace(/\s+/g, '')}@${HOF_EMAIL_DOMAIN}`;
};

const coerceRole = (role) => (role === 'staff' || role === 'manager' ? role : 'customer');

const NOT_CONFIGURED = 'Authentication is unavailable: Supabase is not configured. Please contact the site owner.';

const requireClient = () => {
  if (!supabase) throw new Error(NOT_CONFIGURED);
  return supabase;
};

const fetchProfile = async (userId) => {
  if (!userId) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) return null;
  return data || null;
};

export const fetchRole = async () => {
  try {
    const { data, error } = await supabase.rpc('current_user_role');
    if (error) return 'customer';
    return coerceRole(data);
  } catch {
    return 'customer';
  }
};

const buildUser = (authUser, profile, role) => ({
  id: authUser?.id,
  email: authUser?.email || null,
  username: profile?.username || (authUser?.email || '').split('@')[0],
  name:
    profile?.full_name ||
    authUser?.user_metadata?.full_name ||
    profile?.username ||
    (authUser?.email || '').split('@')[0],
  phone: profile?.phone || authUser?.user_metadata?.phone || '',
  role
});

const mapSignupError = (error) => {
  const m = error?.message || '';
  if (error?.status === 409 || /already registered|already been registered/i.test(m)) {
    return 'This username is already registered. Please choose another.';
  }
  if (/rate limit/i.test(m)) {
    return 'Too many accounts created from this network recently. Please wait a few minutes and try again.';
  }
  if (/password/i.test(m)) return m;
  if (/invalid/i.test(m) || /email/i.test(m)) {
    return 'That username cannot be used for this account type.';
  }
  return m || 'Registration failed. Please try again.';
};

export async function registerCustomer({ username, password, name, phone }) {
  requireClient();
  const email = toEmail(username);
  if (!email || !password || !phone?.trim()) {
    return { ok: false, error: 'Please fill all mandatory fields.' };
  }
  if (password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters.' };
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name?.trim() || username.trim(), phone: phone.trim(), username: username.trim() }
    }
  });
  if (error) return { ok: false, error: mapSignupError(error) };
  if (!data.session) {
    // Email confirmation is enabled on the project: no session yet.
    return { ok: true, needsConfirmation: true, user: { id: data.user?.id, email, username: username.trim() } };
  }
  const profile = await fetchProfile(data.user.id);
  const role = await fetchRole();
  return { ok: true, user: buildUser(data.user, profile, role) };
}

export async function loginCustomer(identifier, password) {
  requireClient();
  const email = toEmail(identifier);
  if (!email || !password) return { ok: false, error: 'Please enter your username and password.' };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      ok: false,
      error: /invalid login credentials/i.test(error.message)
        ? 'Incorrect credentials. Please verify your username and password.'
        : error.message
    };
  }
  const profile = await fetchProfile(data.user.id);
  const role = await fetchRole();
  return { ok: true, user: buildUser(data.user, profile, role) };
}

// Staff login: authenticate, then verify the trusted DB role. Non-staff
// accounts are signed out immediately. Errors never reveal whether an email
// exists.
export async function loginStaff(identifier, password) {
  requireClient();
  const email = toEmail(identifier);
  if (!email || !password) return { ok: false, error: 'Please enter your staff email and password.' };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, error: 'Access denied: invalid credentials.' };
  }

  const role = await fetchRole();
  if (role !== 'staff' && role !== 'manager') {
    await supabase.auth.signOut();
    return { ok: false, error: 'Access denied: this account does not have staff permissions.' };
  }

  const profile = await fetchProfile(data.user.id);
  return { ok: true, user: buildUser(data.user, profile, role) };
}

export async function logout() {
  if (!supabase) return { error: null };
  return supabase.auth.signOut();
}

// The recovery link must land on a page that can read the recovery session.
// This path must be added to Supabase → Authentication → URL Configuration →
// Redirect URLs (see ADMIN.md / the final report).
export const PASSWORD_RESET_PATH = '/reset-password';

const resetRedirectUrl = () => `${window.location.origin}${PASSWORD_RESET_PATH}`;

// Send the official Supabase password-reset email. Accepts a username or a full
// email address. We never reveal whether the address exists (Supabase returns
// success regardless), so the UI must stay neutral.
export async function requestPasswordReset(identifier) {
  requireClient();
  const email = toEmail(identifier);
  if (!email) return { ok: false, error: 'Enter the email address registered to your account.' };
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: resetRedirectUrl() });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'Could not start the password reset.' };
  }
}

// Set a new password for the session created by the recovery link. Supabase
// hashes the password server-side; nothing is ever stored in plaintext here.
export async function updatePassword(newPassword) {
  requireClient();
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters.' };
  }
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'Could not update the password.' };
  }
}

// Rebuild the current-user shape from the persisted Supabase session.
export async function restoreSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session) return null;
  const profile = await fetchProfile(session.user.id);
  const role = await fetchRole();
  return buildUser(session.user, profile, role);
}

// Whether the *current* session is an authorized staff member (DB-verified).
export async function isAuthorizedStaff() {
  if (!supabase) return false;
  const role = await fetchRole();
  return role === 'staff' || role === 'manager';
}

// Subscribe to auth events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc).
export function onSupabaseAuthChange(callback) {
  if (!supabase) return null;
  const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session) {
      callback(null);
      return;
    }
    try {
      const profile = await fetchProfile(session.user.id);
      const role = await fetchRole();
      callback(buildUser(session.user, profile, role));
    } catch {
      callback(buildUser(session.user, null, 'customer'));
    }
  });
  return data.subscription;
}

export { isSupabaseConfigured };
