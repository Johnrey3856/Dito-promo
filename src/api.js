import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;

// Supabase Auth needs an identifier, so the mobile number is mapped to a hidden login address.
// Users only ever type their mobile number and password. No email is sent or shown.
// (Authentication → Sign In / Providers → Email → turn OFF "Confirm email".)
const emailFor = number => `${number}@dito-demo.app`;
const mobileOf = user => user?.user_metadata?.mobile || user?.email?.split('@')[0] || '';

/* ---------- local fallback (used when Supabase env vars are missing) ---------- */
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const listeners = new Set();
const setLocalSession = n => { write('dito-demo-session', n); listeners.forEach(fn => fn(n)); };

/* ---------- brute-force defender (see supabase/security.sql) ---------- */
const deviceMeta = () => ({
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lang: navigator.language,
  screen: `${screen.width}x${screen.height}`, platform: navigator.platform,
});
const track = (kind, number, success, blocked = false, reason = null) =>
  supabase.rpc('record_login_attempt', { p_mobile: number, p_success: success, p_kind: kind, p_blocked: blocked, p_reason: reason, p_meta: deviceMeta() })
    .then(() => {}, () => {});

// Asks the database whether this visitor (by IP, read on the server) may try again. Fails open if the SQL isn't installed.
async function guard(kind, number) {
  const { data, error } = await supabase.rpc('check_login_allowed', { p_mobile: number });
  if (error || !data || data.allowed !== false) return;
  await track(kind, number, false, true, data.reason);
  const mins = Math.max(1, Math.ceil((data.retry_after || 0) / 60));
  throw new Error(data.reason === 'ip_blocked'
    ? 'Access from your network has been blocked because of suspicious activity.'
    : `Too many failed attempts. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
}

/* ---------- auth ---------- */
export async function register(number, password) {
  if (!supabase) {
    const accounts = read('dito-demo-accounts', {});
    if (accounts[number]) throw new Error('This number is already registered. Try logging in.');
    write('dito-demo-accounts', { ...accounts, [number]: await sha256(password) });
    return;
  }
  await guard('register', number);
  const { data, error } = await supabase.auth.signUp({ email: emailFor(number), password, options: { data: { mobile: number } } });
  await track('register', number, !error && data?.user?.identities?.length !== 0, false, error ? 'signup_error' : null);
  if (error) throw new Error(/registered|exists/i.test(error.message) ? 'This number is already registered. Try logging in.' : error.message);
  if (data.user && data.user.identities?.length === 0) throw new Error('This number is already registered. Try logging in.');
  if (data.session) await supabase.auth.signOut(); // registration flows into the login step
}

export async function login(number, password) {
  if (!supabase) {
    const accounts = read('dito-demo-accounts', {});
    if (accounts[number] !== await sha256(password)) throw new Error('Incorrect mobile number or password.');
    return setLocalSession(number);
  }
  if (!/^09\d{9}$/.test(number)) throw new Error('Incorrect mobile number or password.'); // admins sign in on the admin page
  await guard('login', number);
  const { error } = await supabase.auth.signInWithPassword({ email: emailFor(number), password });
  await track('login', number, !error, false, error ? 'bad_password' : null);
  if (error) throw new Error('Incorrect mobile number or password.');
}

export async function logout() {
  if (!supabase) return setLocalSession('');
  await supabase.auth.signOut();
}

export async function getUser() {
  if (!supabase) return read('dito-demo-session', '');
  const { data } = await supabase.auth.getSession();
  return mobileOf(data.session?.user);
}

// Checks with the server that the logged-in account (and its profile row) still exists.
// Returns the mobile number, '' if the account is gone (and signs out), or null if we can't tell (offline).
export async function validateSession() {
  if (!supabase) return null;
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return '';
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    if (error && ![400, 401, 403, 404].includes(error.status)) return null; // network problem, keep session
    await supabase.auth.signOut();
    return '';
  }
  const { data: profile, error: pErr } = await supabase.from('profiles').select('id').eq('id', data.user.id).maybeSingle();
  if (pErr) return null;
  if (!profile) { await supabase.auth.signOut(); return ''; }
  return mobileOf(data.user);
}

export function onAuthChange(callback) {
  if (!supabase) { listeners.add(callback); return () => listeners.delete(callback); }
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(mobileOf(session?.user)));
  return () => data.subscription.unsubscribe();
}

/* ---------- data ---------- */
// Returns promo rows from Supabase, or null so the app keeps its built-in offers.
export async function fetchPromos() {
  if (!supabase) return null;
  const { data, error } = await supabase.from('promos').select('*').eq('active', true).order('sort');
  return error || !data?.length ? null : data;
}

export async function fetchClaimed(number) {
  if (!supabase) return read(`dito-demo-claims-${number}`, []);
  const { data, error } = await supabase.from('claimed_promos').select('promo_id');
  return error ? [] : data.map(r => r.promo_id);
}

export async function claimPromo(number, promoId) {
  if (!supabase) {
    const k = `dito-demo-claims-${number}`;
    write(k, [...new Set([...read(k, []), promoId])]);
    return;
  }
  const { data } = await supabase.auth.getUser();
  const { error } = await supabase.from('claimed_promos')
    .upsert({ user_id: data.user.id, promo_id: promoId }, { onConflict: 'user_id,promo_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}
