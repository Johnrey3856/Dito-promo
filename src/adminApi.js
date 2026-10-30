import { createClient } from '@supabase/supabase-js';

/* ============ ADMIN SESSION (kept apart from the customer website) ============ */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
// A second client with its own storage key: signing in here never logs a customer in, and vice versa.
export const adminSb = url && key ? createClient(url, key, { auth: { storageKey: 'dito-admin-session' } }) : null;
const sb = () => adminSb;
const emailOf = u => (u.includes('@') ? u : `${u}@dito-demo.app`);
const nameOf = email => (email?.endsWith('@dito-demo.app') ? email.split('@')[0] : email || '');
const deviceMeta = () => ({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lang: navigator.language, screen: `${screen.width}x${screen.height}`, platform: navigator.platform });

export async function adminGetUser() {
  if (!adminSb) return '';
  const { data } = await adminSb.auth.getSession();
  return nameOf(data.session?.user?.email);
}
export async function adminLogout() { if (adminSb) await adminSb.auth.signOut(); }

// Admin sign-in: checked by the defender and recorded in admin_login_attempts (not the customer log).
export async function adminLogin(username, password) {
  const u = username.trim().toLowerCase();
  const rec = (ok, blocked = false, reason = null) =>
    adminSb.rpc('admin_record_attempt', { p_username: u, p_success: ok, p_blocked: blocked, p_reason: reason, p_meta: deviceMeta() }).then(() => {}, () => {});
  const { data: g } = await adminSb.rpc('admin_check_login_allowed', { p_username: u });
  if (g && g.allowed === false) {
    await rec(false, true, g.reason);
    const mins = Math.max(1, Math.ceil((g.retry_after || 0) / 60));
    throw new Error(g.reason === 'ip_blocked' ? 'Access from your network has been blocked.' : `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }
  const { error } = await adminSb.auth.signInWithPassword({ email: emailOf(u), password });
  if (error) { await rec(false, false, 'bad_password'); throw new Error('Incorrect username or password.'); }
  const { data: ok } = await adminSb.rpc('is_admin');
  if (!ok) { await adminSb.auth.signOut(); await rec(false, false, 'not_admin'); throw new Error('This account is not an administrator.'); }
  await rec(true);
  return nameOf(emailOf(u));
}

/* ============ LIVE (Supabase) ============ */

export const liveApi = {
  async load() {
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const res = await Promise.all([
      sb().from('login_attempts').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(3000),
      sb().from('blocked_ips').select('*').order('blocked_at', { ascending: false }),
      sb().from('ip_geo').select('*'),
      sb().from('security_settings').select('*').eq('id', 1).maybeSingle(),
      sb().from('profiles').select('*').order('created_at', { ascending: false }),
      sb().from('claimed_promos').select('user_id,promo_id,claimed_at'),
      sb().from('promos').select('*').order('sort'),
      sb().from('admin_login_attempts').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(500),
      sb().from('admins').select('*').order('created_at'),
    ]);
    const bad = res.find(r => r.error);
    if (bad) throw new Error(bad.error.message);
    const [a, b, g, s, p, c, pr, aa, ad] = res;
    return { attempts: a.data, blocked: b.data, geo: Object.fromEntries(g.data.map(x => [x.ip, x])), settings: s.data, profiles: p.data, claims: c.data, promos: pr.data, adminAttempts: aa.data, admins: ad.data };
  },

  // Looks up where an IP is (free ipwho.is service) and caches it in the ip_geo table.
  async enrichGeo(ips) {
    for (const ip of ips.slice(0, 8)) {
      let row = { ip, country: 'Unknown', country_code: null };
      try {
        const j = await (await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`)).json();
        if (j.success) row = {
          ip, country: j.country, country_code: j.country_code, region: j.region, city: j.city,
          lat: j.latitude, lon: j.longitude, isp: j.connection?.isp, org: j.connection?.org,
          asn: j.connection?.asn ? `AS${j.connection.asn}` : null, timezone: j.timezone?.id,
        };
      } catch { /* offline: try again next refresh */ return; }
      await sb().from('ip_geo').upsert(row);
    }
  },

  // Pushes a callback whenever an attempt is logged or an IP is blocked (needs Realtime enabled, see supabase/realtime.sql).
  subscribe(cb) {
    const ch = sb().channel('sx-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'login_attempts' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_login_attempts' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_ips' }, cb)
      .subscribe();
    return () => sb().removeChannel(ch);
  },

  async blockIp(ip, reason, hours) { const { error } = await sb().rpc('admin_block_ip', { p_ip: ip, p_reason: reason, p_hours: hours }); if (error) throw new Error(error.message); },
  async unblockIp(ip) { const { error } = await sb().from('blocked_ips').delete().eq('ip', ip); if (error) throw new Error(error.message); },
  async saveSettings(s) { const { error } = await sb().from('security_settings').update(s).eq('id', 1); if (error) throw new Error(error.message); },
  async deleteUser(id) { const { error } = await sb().rpc('admin_delete_user', { p_id: id }); if (error) throw new Error(error.message); },
  async savePromo(row) { const { error } = await sb().from('promos').upsert(row); if (error) throw new Error(error.message); },
  async removeAdmin(id) { const { error } = await sb().from('admins').delete().eq('user_id', id); if (error) throw new Error(error.message); },
  async deletePromo(id) { const { error } = await sb().from('promos').delete().eq('id', id); if (error) throw new Error(error.message); },
};

export async function isAdmin() {
  if (!adminSb) return false;
  const { data } = await adminSb.rpc('is_admin');
  return data === true;
}

/* ============ DEMO (sample data, nothing is stored) ============ */
// Uses reserved documentation IP ranges (RFC 5737), so none of these belong to anyone.
const SAMPLE = [
  { ip: '203.0.113.14', cc: 'RU', country: 'Russia', city: 'Moscow', region: 'Moscow', lat: 55.75, lon: 37.62, isp: 'Sample Telecom', asn: 'AS64500', w: 40, ua: 'python-requests/2.31.0', mode: 'stuff' },
  { ip: '198.51.100.77', cc: 'CN', country: 'China', city: 'Shenzhen', region: 'Guangdong', lat: 22.54, lon: 114.06, isp: 'Example Broadband', asn: 'AS64501', w: 28, ua: 'curl/8.4.0', mode: 'brute' },
  { ip: '192.0.2.33', cc: 'BR', country: 'Brazil', city: 'São Paulo', region: 'São Paulo', lat: -23.55, lon: -46.63, isp: 'Demo Net', asn: 'AS64502', w: 14, ua: 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120', mode: 'brute' },
  { ip: '203.0.113.201', cc: 'NG', country: 'Nigeria', city: 'Lagos', region: 'Lagos', lat: 6.52, lon: 3.38, isp: 'Test Mobile', asn: 'AS64503', w: 9, ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/119', mode: 'stuff' },
  { ip: '198.51.100.5', cc: 'US', country: 'United States', city: 'Ashburn', region: 'Virginia', lat: 39.04, lon: -77.49, isp: 'Sample Cloud Hosting', asn: 'AS64504', w: 6, ua: 'Go-http-client/2.0', mode: 'brute' },
  { ip: '192.0.2.150', cc: 'PH', country: 'Philippines', city: 'Quezon City', region: 'Metro Manila', lat: 14.68, lon: 121.04, isp: 'Demo PH Fiber', asn: 'AS64505', w: 3, ua: 'Mozilla/5.0 (Android 14) Chrome/120 Mobile', mode: 'typo' },
  { ip: '203.0.113.88', cc: 'PH', country: 'Philippines', city: 'Cebu City', region: 'Central Visayas', lat: 10.32, lon: 123.89, isp: 'Demo PH Mobile', asn: 'AS64506', w: 2, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari', mode: 'typo' },
];

export function makeDemoApi() {
  const now = Date.now();
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const mobile = () => '09' + String(rnd(100000000, 999999999));
  const victim = ['09171234567', '09308219690', '09451112233'];
  const attempts = []; let id = 1;
  for (const s of SAMPLE) {
    const targets = s.mode === 'stuff' ? Array.from({ length: 12 }, mobile) : [victim[rnd(0, 2)]];
    for (let i = 0; i < s.w * 3; i++) {
      const ago = Math.random() ** 1.6 * 24 * 3600e3 * 2;
      attempts.push({ id: id++, created_at: new Date(now - ago).toISOString(), kind: 'login', mobile: targets[rnd(0, targets.length - 1)], success: false, blocked: i > s.w * 2.2, reason: i > s.w * 2.2 ? 'ip_locked' : 'bad_password', ip: s.ip, user_agent: s.ua, origin: 'http://localhost:5173', language: 'en-US', meta: { tz: 'UTC', screen: '1920x1080', platform: 'Linux' } });
    }
  }
  for (let i = 0; i < 60; i++) attempts.push({ id: id++, created_at: new Date(now - Math.random() * 48 * 3600e3).toISOString(), kind: 'login', mobile: victim[rnd(0, 2)], success: true, blocked: false, ip: SAMPLE[5 + (i % 2)].ip, user_agent: SAMPLE[5].ua, origin: 'http://localhost:5173', language: 'en-PH', meta: {} });
  attempts.sort((a, b) => b.created_at.localeCompare(a.created_at));

  const st = {
    attempts,
    blocked: [
      { ip: '203.0.113.14', reason: 'Auto-blocked: 62 failed attempts in 60 minutes', auto: true, blocked_at: new Date(now - 3600e3).toISOString(), expires_at: new Date(now + 23 * 3600e3).toISOString() },
      { ip: '198.51.100.77', reason: 'Manual: scripted brute force (curl)', auto: false, blocked_at: new Date(now - 5 * 3600e3).toISOString(), expires_at: null },
    ],
    geo: Object.fromEntries(SAMPLE.map(s => [s.ip, { ip: s.ip, country: s.country, country_code: s.cc, region: s.region, city: s.city, lat: s.lat, lon: s.lon, isp: s.isp, org: s.isp, asn: s.asn, timezone: 'UTC' }])),
    settings: { id: 1, max_failures: 5, window_minutes: 15, lockout_minutes: 15, auto_block: true, auto_block_failures: 20, auto_block_hours: 24 },
    profiles: victim.map((m, i) => ({ id: `demo-${i}`, mobile: m, created_at: new Date(now - (i + 1) * 86400e3).toISOString() })),
    claims: [{ user_id: 'demo-0', promo_id: 'data-boost', claimed_at: new Date().toISOString() }, { user_id: 'demo-0', promo_id: 'game-zone', claimed_at: new Date().toISOString() }, { user_id: 'demo-1', promo_id: 'daily-lite', claimed_at: new Date().toISOString() }],
    adminAttempts: [
      ...Array.from({ length: 14 }, (_, i) => ({ id: 9000 + i, created_at: new Date(now - i * 1800e3).toISOString(), username: 'admin', success: false, blocked: i < 4, reason: i < 4 ? 'ip_locked' : 'bad_password', ip: '198.51.100.77', user_agent: 'curl/8.4.0', meta: {} })),
      { id: 9100, created_at: new Date(now - 600e3).toISOString(), username: 'admin', success: true, blocked: false, reason: null, ip: '192.0.2.150', user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', meta: {} },
    ],
    admins: [{ user_id: 'demo-admin', username: 'admin', email: 'admin@dito-demo.app', created_at: new Date(now - 5 * 86400e3).toISOString() }, { user_id: 'demo-admin-2', username: 'manager', email: 'manager@dito-demo.app', created_at: new Date(now - 86400e3).toISOString() }],
    promos: [
      { id: 'data-boost', category: 'Data', tag: 'DATA BOOST', title: 'More data. More doing.', description: 'Demo promo', price: '₱99', detail: '30 GB • 7 days', icon: 'Zap', perks: [], sort: 1, active: true },
      { id: 'game-zone', category: 'Entertainment', tag: 'GAME ZONE', title: 'Level up your connection.', description: 'Demo promo', price: '₱129', detail: 'Game data • 15 days', icon: 'Gamepad2', perks: [], sort: 6, active: true },
    ],
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  return {
    demo: true,
    async load() { await wait(150); return structuredClone(st); },
    async enrichGeo() {},
    subscribe(cb) {
      const t = setInterval(() => {
        const sm = SAMPLE[1 + Math.floor(Math.random() * 3)];
        st.attempts.unshift({ id: Date.now(), created_at: new Date().toISOString(), kind: 'login', mobile: victim[rnd(0, 2)], success: false, blocked: false, reason: 'bad_password', ip: sm.ip, user_agent: sm.ua, origin: 'http://localhost:5173', language: 'en-US', meta: { tz: 'UTC', screen: '1920x1080' } });
        cb();
      }, 3500);
      return () => clearInterval(t);
    },
    async blockIp(ip, reason, hours) { st.blocked = [{ ip, reason, auto: false, blocked_at: new Date().toISOString(), expires_at: hours ? new Date(Date.now() + hours * 3600e3).toISOString() : null }, ...st.blocked.filter(b => b.ip !== ip)]; },
    async unblockIp(ip) { st.blocked = st.blocked.filter(b => b.ip !== ip); },
    async saveSettings(s) { st.settings = { ...st.settings, ...s }; },
    async deleteUser(uid) { st.profiles = st.profiles.filter(p => p.id !== uid); st.claims = st.claims.filter(c => c.user_id !== uid); },
    async savePromo(row) { st.promos = [...st.promos.filter(p => p.id !== row.id), row].sort((a, b) => a.sort - b.sort); },
    async removeAdmin(uid) { st.admins = st.admins.filter(a => a.user_id !== uid); },
    async deletePromo(pid) { st.promos = st.promos.filter(p => p.id !== pid); },
  };
}
