import { supabase } from './supabase.js';

// Authentication layer built on Supabase Auth.
// Passwords are handled entirely by Supabase Auth (hashed server-side).
// Roles come from trusted DB records (profiles/staff_roles), never from the browser.

export const HOF_EMAIL_DOMAIN = 'hof.in';

// The app logs users in with a "username". Under the hood every account is an
// email/password Supabase Auth account using the deterministic convention
// `username@hof.order` (unless the user types a full email).
export const toEmail = (identifier) => {
  const id = (identifier || '').trim();
  if (!id) return '';
  if (id.includes('@')) return id.toLowerCase();
  return `${id.toLowerCase().replace(/\s+/g, '')}@${HOF_EMAIL_DOMAIN}`;
};

const coerceRole = (role) => (role === 'staff' || role === 'manager' ? role : 'customer');

const fetchProfile = async (userId) => {
  if (!userId) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return data || null;
};

const fetchRole = async () => {
  try {
    const { data } = await supabase.rpc('current_user_role');
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
  if (/invalid/i.test(m) || /email/i.test(m)) {
    return 'That username cannot be used for this account type.';
  }
  if (/password/i.test(m)) return m;
  return m || 'Registration failed. Please try again.';
};

export async function registerCustomer({ username, password, name, phone }) {
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

export async function loginStaff(identifier, password) {
  const email = toEmail(identifier);
  if (!email || !password) return { ok: false, error: 'Please enter your staff username and password.' };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      ok: false,
      error: /invalid login credentials/i.test(error.message)
        ? 'Access Denied: Invalid credentials.'
        : error.message
    };
  }
  const role = await fetchRole();
  if (role === 'customer') {
    await supabase.auth.signOut();
    return { ok: false, error: 'Access Denied: This account has no staff permissions.' };
  }
  const profile = await fetchProfile(data.user.id);
  return { ok: true, user: buildUser(data.user, profile, role) };
}

export async function logout() {
  return supabase.auth.signOut();
}

// Rebuild the current-user shape from the persisted Supabase session.
export async function restoreSession() {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session) return null;
  const profile = await fetchProfile(session.user.id);
  const role = await fetchRole();
  return buildUser(session.user, profile, role);
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