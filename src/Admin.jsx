import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ShieldCheck, ShieldAlert, LayoutDashboard, ScrollText, Crosshair, Ban, Users, Package, Settings, LogOut,
  Search, Copy, ExternalLink, Download, X, Globe, Lock, Activity, RefreshCw, Trash2, Plus, Radio, KeyRound, Eye, EyeOff, ArrowLeft,
} from 'lucide-react';
import { liveApi, isAdmin, makeDemoApi, adminSb, adminLogin, adminLogout, adminGetUser } from './adminApi.js';
import './admin.css';

/* ---------------- helpers ---------------- */
// Windows can't draw flag emojis, so use small flag images.
const flag = cc => cc && cc.length === 2
  ? <img className="sx-flagimg" src={`https://flagcdn.com/w20/${cc.toLowerCase()}.png`} alt={cc} width="20" height="15" />
  : <span className="sx-flagimg">🌐</span>;
const fmt = t => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const ago = t => {
  const s = Math.max(0, (Date.now() - new Date(t)) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
// The IP and the lookup text come from outside, so escape them before they go into the map tooltip's HTML.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const activeBlock = b => b && (!b.expires_at || new Date(b.expires_at) > new Date()) ? b : null;
const where = g => g && g.country && g.country !== 'Unknown' ? [g.city, g.country].filter(Boolean).join(', ') : 'Locating…';

function deriveAttackers(attempts, geo, blocked) {
  const map = new Map();
  for (const a of attempts) {
    if (!a.ip) continue;
    let r = map.get(a.ip);
    if (!r) { r = { ip: a.ip, total: 0, fails: 0, ok: 0, refused: 0, targets: new Set(), first: a.created_at, last: a.created_at, uas: new Set(), attempts: [] }; map.set(a.ip, r); }
    r.total++;
    if (a.success) r.ok++; else if (a.blocked) r.refused++; else r.fails++;
    if (a.mobile) r.targets.add(a.mobile);
    if (a.created_at < r.first) r.first = a.created_at;
    if (a.created_at > r.last) r.last = a.created_at;
    if (a.user_agent) r.uas.add(a.user_agent);
    r.attempts.push(a);
  }
  const bl = new Map(blocked.map(b => [b.ip, b]));
  return [...map.values()].map(r => {
    const targets = r.targets.size;
    const type = targets >= 5 && r.fails >= 5 ? 'Credential stuffing' : r.fails >= 5 ? 'Brute force' : r.fails >= 1 ? 'Suspicious' : 'Normal';
    const sev = r.fails >= 20 || targets >= 8 ? 'critical' : r.fails >= 10 || (targets >= 5 && r.fails >= 5) ? 'high' : r.fails >= 5 ? 'medium' : r.fails >= 1 ? 'low' : 'none';
    return { ...r, targets, type, sev, geo: geo[r.ip], block: activeBlock(bl.get(r.ip)) };
  }).sort((a, b) => b.fails - a.fails || b.total - a.total);
}

/* ---------------- tiny UI pieces ---------------- */
const Sev = ({ s }) => <span className={`sx-sev sx-sev-${s}`}>{s === 'none' ? 'clean' : s}</span>;
const Stat = ({ icon: I, label, value, sub, tone = 'cyan' }) => (
  <div className={`sx-stat sx-tone-${tone}`}><div className="sx-stat-ico"><I size={20} /></div><div><p>{label}</p><strong>{value}</strong>{sub && <small>{sub}</small>}</div></div>
);
const Card = ({ title, right, children, className = '' }) => (
  <section className={`sx-card ${className}`}><header><h3>{title}</h3>{right}</header>{children}</section>
);

function Timeline({ attempts }) {
  const buckets = useMemo(() => {
    const out = Array.from({ length: 24 }, (_, i) => ({ h: new Date(Date.now() - (23 - i) * 3600e3), ok: 0, fail: 0, ref: 0 }));
    for (const a of attempts) {
      const i = 23 - Math.floor((Date.now() - new Date(a.created_at)) / 3600e3);
      if (i < 0 || i > 23) continue;
      if (a.success) out[i].ok++; else if (a.blocked) out[i].ref++; else out[i].fail++;
    }
    return out;
  }, [attempts]);
  const max = Math.max(4, ...buckets.map(b => b.ok + b.fail + b.ref));
  return (
    <div className="sx-chart">
      <svg viewBox="0 0 480 160" preserveAspectRatio="none">
        {[0, .25, .5, .75, 1].map(t => <line key={t} x1="0" x2="480" y1={150 - t * 140} y2={150 - t * 140} className="sx-grid" />)}
        {buckets.map((b, i) => {
          const x = i * 20 + 3, w = 14, s = 140 / max;
          const hOk = b.ok * s, hFail = b.fail * s, hRef = b.ref * s;
          return <g key={i}>
            <rect x={x} y={150 - hOk} width={w} height={hOk} className="sx-bar-ok" rx="2" />
            <rect x={x} y={150 - hOk - hFail} width={w} height={hFail} className="sx-bar-fail" rx="2" />
            <rect x={x} y={150 - hOk - hFail - hRef} width={w} height={hRef} className="sx-bar-ref" rx="2" />
            <title>{`${b.h.getHours()}:00 — ${b.ok} ok, ${b.fail} failed, ${b.ref} refused`}</title>
          </g>;
        })}
      </svg>
      <div className="sx-chart-x"><span>24h ago</span><span>12h</span><span>now</span></div>
      <div className="sx-legend"><i className="ok" />Successful<i className="fail" />Failed<i className="ref" />Refused by defender</div>
    </div>
  );
}

function ThreatMap({ attackers, onPick }) {
  const el = useRef(null); const map = useRef(null); const layer = useRef(null);
  useEffect(() => {
    map.current = L.map(el.current, { center: [20, 10], zoom: 2, minZoom: 2, worldCopyJump: true, zoomControl: false, attributionControl: true });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 8, attribution: 'Tiles © Esri' }).addTo(map.current);
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => map.current.remove();
  }, []);
  useEffect(() => {
    layer.current.clearLayers();
    attackers.filter(a => a.geo?.lat != null && a.fails > 0).forEach(a => {
      const color = a.block ? '#ff3b5c' : a.sev === 'critical' || a.sev === 'high' ? '#ff8a3d' : '#22d3ee';
      const r = Math.min(26, 6 + Math.sqrt(a.fails) * 3);
      L.circleMarker([a.geo.lat, a.geo.lon], { radius: r * 1.9, color, weight: 0, fillColor: color, fillOpacity: .12 }).addTo(layer.current);
      L.circleMarker([a.geo.lat, a.geo.lon], { radius: r, color, weight: 1.5, fillColor: color, fillOpacity: .45 })
        .bindTooltip(`<b>${esc(a.ip)}</b><br>${esc(where(a.geo))}<br>${a.fails} failed • ${esc(a.type)}`, { className: 'sx-tip' })
        .on('click', () => onPick(a)).addTo(layer.current);
    });
  }, [attackers, onPick]);
  return <div className="sx-map" ref={el} />;
}

/* ---------------- views ---------------- */
function Overview({ d, attackers, onPick, setView }) {
  const day = d.attempts.filter(a => Date.now() - new Date(a.created_at) < 864e5);
  const fails = day.filter(a => !a.success && !a.blocked).length;
  const oks = day.filter(a => a.success).length;
  const refused = day.filter(a => a.blocked).length;
  const hostile = attackers.filter(a => a.fails >= 5);
  const activeBlocks = d.blocked.filter(activeBlock).length;
  const topTargets = useMemo(() => {
    const m = {}; day.filter(a => !a.success && a.mobile).forEach(a => { m[a.mobile] = (m[a.mobile] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [day]);
  const live = d.attempts.slice(0, 7);
  const threat = hostile.some(a => a.sev === 'critical' && !a.block) ? ['critical', 'ACTIVE ATTACK'] : hostile.some(a => !a.block) ? ['elevated', 'ELEVATED'] : ['calm', 'ALL CLEAR'];

  return <>
    <div className={`sx-banner sx-banner-${threat[0]}`}>
      {threat[0] === 'calm' ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
      <div><b>Threat level: {threat[1]}</b><span>{hostile.length} hostile IP{hostile.length === 1 ? '' : 's'} seen • {activeBlocks} currently blocked • {refused} requests refused in 24h</span></div>
    </div>
    <div className="sx-stats">
      <Stat icon={Activity} label="Attempts (24h)" value={day.length} sub={`${oks} successful`} />
      <Stat icon={KeyRound} label="Failed logins" value={fails} sub={`${day.length ? Math.round(fails / day.length * 100) : 0}% of traffic`} tone="amber" />
      <Stat icon={Crosshair} label="Hostile IPs" value={hostile.length} sub="5+ failures" tone="red" />
      <Stat icon={Ban} label="Blocked IPs" value={activeBlocks} sub={`${d.blocked.filter(b => b.auto && activeBlock(b)).length} automatic`} tone="red" />
      <Stat icon={Lock} label="Refused by defender" value={refused} sub="lockouts + blocks" tone="violet" />
      <Stat icon={Users} label="Registered users" value={d.profiles.length} sub={`${d.claims.length} promos claimed`} tone="green" />
    </div>
    <div className="sx-grid-2">
      <Card title="Attack timeline — last 24 hours"><Timeline attempts={d.attempts} /></Card>
      <Card title="Live feed" right={<span className="sx-live"><Radio size={13} /> LIVE</span>}>
        <ul className="sx-feed">{live.map(a => {
          const g = d.geo[a.ip];
          return <li key={a.id} className={a.success ? 'ok' : a.blocked ? 'ref' : 'fail'}>
            <i /><div><b>{a.success ? 'Login OK' : a.blocked ? 'Refused' : 'Failed login'}</b> <code>{a.mobile || '—'}</code><small>{flag(g?.country_code)} {a.ip || 'unknown'} • {ago(a.created_at)}</small></div>
          </li>;
        })}{!live.length && <li className="sx-empty">No activity yet.</li>}</ul>
      </Card>
    </div>
    <Card title="Attacker locations" right={<button className="sx-link" onClick={() => setView('attackers')}>All attackers →</button>} className="sx-map-card">
      <ThreatMap attackers={attackers} onPick={onPick} />
      <div className="sx-map-legend"><i className="r" /> Blocked <i className="o" /> High risk <i className="c" /> Watching</div>
    </Card>
    <div className="sx-grid-2">
      <Card title="Top attackers" right={<button className="sx-link" onClick={() => setView('attackers')}>View all →</button>}>
        <table className="sx-table sx-click"><tbody>{attackers.filter(a => a.fails > 0).slice(0, 6).map(a => (
          <tr key={a.ip} onClick={() => onPick(a)}><td>{flag(a.geo?.country_code)}</td><td><code>{a.ip}</code><small>{where(a.geo)}</small></td><td>{a.fails} fails</td><td><Sev s={a.sev} /></td></tr>
        ))}</tbody></table>
        {!attackers.some(a => a.fails > 0) && <p className="sx-empty">No failed attempts recorded.</p>}
      </Card>
      <Card title="Most targeted numbers">
        <ul className="sx-bars">{topTargets.map(([m, n]) => <li key={m}><code>{m}</code><span><i style={{ width: `${n / topTargets[0][1] * 100}%` }} /></span><b>{n}</b></li>)}</ul>
        {!topTargets.length && <p className="sx-empty">Nothing targeted.</p>}
      </Card>
    </div>
  </>;
}

function AttemptLog({ d }) {
  const [filter, setFilter] = useState('all'); const [q, setQ] = useState('');
  const rows = useMemo(() => d.attempts.filter(a => {
    if (filter === 'failed' && (a.success || a.blocked)) return false;
    if (filter === 'success' && !a.success) return false;
    if (filter === 'refused' && !a.blocked) return false;
    if (!q) return true;
    return [a.ip, a.mobile, a.user_agent, d.geo[a.ip]?.country, d.geo[a.ip]?.city].some(v => v && String(v).toLowerCase().includes(q.toLowerCase()));
  }), [d, filter, q]);
  const exportCsv = () => {
    const head = ['time', 'type', 'result', 'mobile', 'ip', 'country', 'city', 'isp', 'user_agent'];
    const lines = rows.map(a => { const g = d.geo[a.ip] || {}; return [a.created_at, a.kind, a.success ? 'success' : a.blocked ? 'refused:' + a.reason : 'failed', a.mobile, a.ip, g.country, g.city, g.isp, a.user_agent].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','); });
    const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: `login-attempts-${Date.now()}.csv` }).click();
    URL.revokeObjectURL(url);
  };
  return <Card title={`Attempt log (${rows.length})`} right={<button className="sx-btn ghost" onClick={exportCsv}><Download size={15} /> Export CSV</button>}>
    <div className="sx-toolbar">
      <div className="sx-search"><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search IP, number, country, device…" /></div>
      <div className="sx-seg">{['all', 'failed', 'refused', 'success'].map(f => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f}</button>)}</div>
    </div>
    <div className="sx-scroll"><table className="sx-table">
      <thead><tr><th>Time</th><th>Result</th><th>Type</th><th>Number</th><th>IP address</th><th>Location</th><th>ISP</th><th>Device</th></tr></thead>
      <tbody>{rows.slice(0, 300).map(a => { const g = d.geo[a.ip]; return (
        <tr key={a.id}><td>{fmt(a.created_at)}</td>
          <td><span className={`sx-res ${a.success ? 'ok' : a.blocked ? 'ref' : 'fail'}`}>{a.success ? 'success' : a.blocked ? 'refused' : 'failed'}</span></td>
          <td>{a.kind}</td><td><code>{a.mobile || '—'}</code></td><td><code>{a.ip || '—'}</code></td>
          <td>{flag(g?.country_code)} {where(g)}</td><td>{g?.isp || '—'}</td><td className="sx-ua" title={a.user_agent}>{a.user_agent || '—'}</td></tr>); })}</tbody>
    </table>{!rows.length && <p className="sx-empty">No matching attempts.</p>}</div>
  </Card>;
}

function Attackers({ attackers, onPick }) {
  const [all, setAll] = useState(false);
  const rows = attackers.filter(a => all || a.fails > 0 || a.block);
  return <Card title={`Tracked IP addresses (${rows.length})`} right={<label className="sx-check"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> include clean IPs</label>}>
    <div className="sx-scroll"><table className="sx-table sx-click">
      <thead><tr><th></th><th>IP address</th><th>Location</th><th>ISP / network</th><th>Failed</th><th>Targets</th><th>Pattern</th><th>Risk</th><th>Status</th><th>Last seen</th></tr></thead>
      <tbody>{rows.map(a => (
        <tr key={a.ip} onClick={() => onPick(a)}><td className="sx-flag">{flag(a.geo?.country_code)}</td><td><code>{a.ip}</code></td><td>{where(a.geo)}</td><td>{a.geo?.isp || '—'}</td>
          <td><b>{a.fails}</b></td><td>{a.targets}</td><td>{a.type}</td><td><Sev s={a.sev} /></td>
          <td>{a.block ? <span className="sx-res fail">blocked</span> : <span className="sx-res ok">allowed</span>}</td><td>{ago(a.last)}</td></tr>))}</tbody>
    </table>{!rows.length && <p className="sx-empty">No attackers recorded. 🎉</p>}</div>
  </Card>;
}

function Blocked({ d, act }) {
  const [ip, setIp] = useState(''); const [reason, setReason] = useState(''); const [hours, setHours] = useState('24');
  return <>
    <Card title="Block an IP address">
      <form className="sx-form row" onSubmit={e => { e.preventDefault(); if (ip.trim()) { act(() => api2.blockIp(ip.trim(), reason || 'Manual block', hours === 'perm' ? null : Number(hours)), `Blocked ${ip}`); setIp(''); setReason(''); } }}>
        <input placeholder="IP address, e.g. 203.0.113.9" value={ip} onChange={e => setIp(e.target.value)} />
        <input placeholder="Reason" value={reason} onChange={e => setReason(e.target.value)} />
        <select value={hours} onChange={e => setHours(e.target.value)}><option value="1">1 hour</option><option value="24">24 hours</option><option value="168">7 days</option><option value="perm">Permanent</option></select>
        <button className="sx-btn danger"><Ban size={15} /> Block</button>
      </form>
    </Card>
    <Card title={`Blocklist (${d.blocked.filter(activeBlock).length} active)`}>
      <div className="sx-scroll"><table className="sx-table">
        <thead><tr><th>IP</th><th>Location</th><th>Reason</th><th>Type</th><th>Blocked</th><th>Expires</th><th></th></tr></thead>
        <tbody>{d.blocked.map(b => { const g = d.geo[b.ip]; const on = !!activeBlock(b); return (
          <tr key={b.ip} className={on ? '' : 'sx-dim'}><td><code>{b.ip}</code></td><td>{flag(g?.country_code)} {where(g)}</td><td>{b.reason}</td>
            <td>{b.auto ? <span className="sx-res ref">auto</span> : <span className="sx-res fail">manual</span>}</td><td>{ago(b.blocked_at)}</td>
            <td>{b.expires_at ? (on ? fmt(b.expires_at) : 'expired') : 'never'}</td>
            <td><button className="sx-btn ghost sm" onClick={() => act(() => api2.unblockIp(b.ip), `Unblocked ${b.ip}`)}>Unblock</button></td></tr>); })}</tbody>
      </table>{!d.blocked.length && <p className="sx-empty">Nobody is blocked.</p>}</div>
    </Card>
  </>;
}

function UsersView({ d, act }) {
  const people = d.profiles;
  const counts = useMemo(() => { const m = {}; d.claims.forEach(c => { m[c.user_id] = (m[c.user_id] || 0) + 1; }); return m; }, [d.claims]);
  const fails = useMemo(() => { const m = {}; d.attempts.forEach(a => { if (!a.success && !a.blocked && a.mobile) m[a.mobile] = (m[a.mobile] || 0) + 1; }); return m; }, [d.attempts]);
  return <Card title={`Registered users (${people.length})`}>
    <div className="sx-scroll"><table className="sx-table">
      <thead><tr><th>Mobile number</th><th>Joined</th><th>Promos claimed</th><th>Failed logins (7d)</th><th></th></tr></thead>
      <tbody>{people.map(p => (
        <tr key={p.id}><td><code>{p.mobile}</code></td><td>{fmt(p.created_at)}</td><td>{counts[p.id] || 0}</td>
          <td>{fails[p.mobile] ? <span className="sx-res fail">{fails[p.mobile]}</span> : 0}</td>
          <td><button className="sx-btn ghost sm danger-t" onClick={() => confirm(`Delete ${p.mobile} and all of their claims?`) && act(() => api2.deleteUser(p.id), `Deleted ${p.mobile}`)}><Trash2 size={14} /> Delete</button></td></tr>))}</tbody>
    </table>{!people.length && <p className="sx-empty">No users yet.</p>}</div>
  </Card>;
}

function PromosView({ d, act }) {
  const blank = { id: '', category: 'Data', tag: '', title: '', description: '', price: '₱', detail: '', icon: 'Gift', perks: '' };
  const [n, setN] = useState(blank);
  const claimsBy = useMemo(() => { const m = {}; d.claims.forEach(c => { m[c.promo_id] = (m[c.promo_id] || 0) + 1; }); return m; }, [d.claims]);
  const add = e => {
    e.preventDefault();
    const id = n.id.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (!id || !n.title) return;
    act(() => api2.savePromo({ ...n, id, tag: n.tag || n.title.toUpperCase(), perks: n.perks.split(',').map(s => s.trim()).filter(Boolean), sort: d.promos.length + 1, active: true }), `Added ${n.title}`);
    setN(blank);
  };
  return <>
    <Card title="Add an offer">
      <form className="sx-form grid" onSubmit={add}>
        <input placeholder="id (e.g. weekend-pass)" value={n.id} onChange={e => setN({ ...n, id: e.target.value })} />
        <input placeholder="Title" value={n.title} onChange={e => setN({ ...n, title: e.target.value })} />
        <select value={n.category} onChange={e => setN({ ...n, category: e.target.value })}>{['Data', 'Bundles', 'Entertainment', 'Calls & Texts'].map(c => <option key={c}>{c}</option>)}</select>
        <select value={n.icon} onChange={e => setN({ ...n, icon: e.target.value })}>{['Zap', 'Wifi', 'Gift', 'Globe', 'Gamepad2', 'Tv', 'Phone', 'Home', 'Music'].map(c => <option key={c}>{c}</option>)}</select>
        <input placeholder="Price (₱99)" value={n.price} onChange={e => setN({ ...n, price: e.target.value })} />
        <input placeholder="Detail (30 GB • 7 days)" value={n.detail} onChange={e => setN({ ...n, detail: e.target.value })} />
        <input className="wide" placeholder="Description" value={n.description} onChange={e => setN({ ...n, description: e.target.value })} />
        <input className="wide" placeholder="Perks, comma separated" value={n.perks} onChange={e => setN({ ...n, perks: e.target.value })} />
        <button className="sx-btn"><Plus size={15} /> Add offer</button>
      </form>
    </Card>
    <Card title={`Offers (${d.promos.length})`}>
      <div className="sx-scroll"><table className="sx-table">
        <thead><tr><th>Offer</th><th>Category</th><th>Price</th><th>Detail</th><th>Claims</th><th>Visible</th><th></th></tr></thead>
        <tbody>{d.promos.map(p => (
          <tr key={p.id} className={p.active ? '' : 'sx-dim'}><td><b>{p.title}</b><small>{p.id}</small></td><td>{p.category}</td>
            <td><input className="sx-inline" defaultValue={p.price} onBlur={e => e.target.value !== p.price && act(() => api2.savePromo({ ...p, price: e.target.value }), 'Price saved')} /></td>
            <td>{p.detail}</td><td>{claimsBy[p.id] || 0}</td>
            <td><button className={`sx-switch ${p.active ? 'on' : ''}`} onClick={() => act(() => api2.savePromo({ ...p, active: !p.active }), p.active ? 'Hidden' : 'Published')}><i /></button></td>
            <td><button className="sx-btn ghost sm danger-t" onClick={() => confirm(`Delete "${p.title}"? Claims of it are deleted too.`) && act(() => api2.deletePromo(p.id), 'Offer deleted')}><Trash2 size={14} /></button></td></tr>))}</tbody>
      </table></div>
    </Card>
  </>;
}

function SettingsView({ d, act }) {
  const [s, setS] = useState(d.settings);
  const num = (k, label, hint) => <label className="sx-field"><span>{label}<small>{hint}</small></span><input type="number" min="1" value={s[k]} onChange={e => setS({ ...s, [k]: Number(e.target.value) })} /></label>;
  return <Card title="Defender rules">
    <form className="sx-form settings" onSubmit={e => { e.preventDefault(); act(() => api2.saveSettings({ max_failures: s.max_failures, window_minutes: s.window_minutes, lockout_minutes: s.lockout_minutes, auto_block: s.auto_block, auto_block_failures: s.auto_block_failures, auto_block_hours: s.auto_block_hours }), 'Rules saved'); }}>
      {num('max_failures', 'Failed logins allowed', 'before an IP is locked out')}
      {num('window_minutes', 'Counting window (minutes)', 'how far back failures are counted')}
      {num('lockout_minutes', 'Lockout length (minutes)', 'how long the IP must wait')}
      <label className="sx-field"><span>Automatic IP blocking<small>block heavy attackers without asking</small></span>
        <button type="button" className={`sx-switch ${s.auto_block ? 'on' : ''}`} onClick={() => setS({ ...s, auto_block: !s.auto_block })}><i /></button></label>
      {num('auto_block_failures', 'Auto-block after (failures / 60 min)', 'threshold for a block')}
      {num('auto_block_hours', 'Auto-block length (hours)', 'how long the block lasts')}
      <button className="sx-btn"><ShieldCheck size={15} /> Save rules</button>
    </form>
    <p className="sx-note">An account is also locked when it receives {s.max_failures * 2} failures in {s.window_minutes} min from any combination of IPs (protects a single targeted victim).</p>
  </Card>;
}

function AdminsView({ d, act, me }) {
  const rows = d.adminAttempts;
  const fails = rows.filter(a => !a.success && !a.blocked).length;
  return <>
    <Card title={`Administrator accounts (${d.admins.length})`}>
      <p className="sx-note" style={{ marginTop: 0, marginBottom: 14 }}>These accounts are kept apart from customers: they have their own sign-in log and their own browser session. To add one, create the login in Supabase and add it to the <code>admins</code> table.</p>
      <div className="sx-scroll"><table className="sx-table">
        <thead><tr><th>Username</th><th>Email</th><th>Added</th><th></th></tr></thead>
        <tbody>{d.admins.map(a => (
          <tr key={a.user_id}><td><code>{a.username || '—'}</code>{a.username === me && <span className="sx-chip green" style={{ marginLeft: 8 }}>you</span>}</td><td>{a.email || '—'}</td><td>{fmt(a.created_at)}</td>
            <td>{a.username !== me && d.admins.length > 1 && <button className="sx-btn ghost sm danger-t" onClick={() => confirm(`Remove admin rights from ${a.username || a.email}?`) && act(() => api2.removeAdmin(a.user_id), 'Admin rights removed')}><Trash2 size={14} /> Remove</button>}</td></tr>))}</tbody>
      </table></div>
    </Card>
    <Card title={`Admin sign-in log (${rows.length})`} right={<span className="sx-chip">{fails} failed</span>}>
      <div className="sx-scroll"><table className="sx-table">
        <thead><tr><th>Time</th><th>Result</th><th>Username</th><th>IP address</th><th>Location</th><th>Device</th></tr></thead>
        <tbody>{rows.slice(0, 100).map(a => { const g = d.geo[a.ip]; return (
          <tr key={a.id}><td>{fmt(a.created_at)}</td>
            <td><span className={`sx-res ${a.success ? 'ok' : a.blocked ? 'ref' : 'fail'}`}>{a.success ? 'success' : a.blocked ? 'refused' : 'failed'}</span>{a.reason && !a.success && <small>{a.reason}</small>}</td>
            <td><code>{a.username || '—'}</code></td><td><code>{a.ip || '—'}</code></td><td>{flag(g?.country_code)} {where(g)}</td>
            <td className="sx-ua" title={a.user_agent}>{a.user_agent || '—'}</td></tr>); })}</tbody>
      </table>{!rows.length && <p className="sx-empty">No admin sign-ins yet.</p>}</div>
    </Card>
  </>;
}

const TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const BOT = /curl|python|requests|go-http|headless|bot|wget|axios|node-fetch|okhttp|java\/|libwww|postman|insomnia/i;

function parseUA(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Version\/.*Safari\//.test(ua) ? 'Safari'
    : /curl/i.test(ua) ? 'curl' : /python-requests/i.test(ua) ? 'python-requests' : /Go-http/i.test(ua) ? 'Go HTTP client' : ua ? 'Other' : 'Unknown';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux|X11/.test(ua) ? 'Linux' : '—';
  return { browser, os, bot: BOT.test(ua) };
}

function MiniMap({ lat, lon }) {
  const el = useRef(null);
  useEffect(() => {
    const m = L.map(el.current, { center: [lat, lon], zoom: 6, zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false });
    L.tileLayer(TILES, { maxZoom: 8 }).addTo(m);
    L.circleMarker([lat, lon], { radius: 26, weight: 0, fillColor: '#ff3b5c', fillOpacity: .18 }).addTo(m);
    L.circleMarker([lat, lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#ff3b5c', fillOpacity: 1 }).addTo(m);
    return () => m.remove();
  }, [lat, lon]);
  return <div className="sx-minimap" ref={el} />;
}

function Gauge({ score, label }) {
  const col = score >= 70 ? '#ff3b5c' : score >= 45 ? '#ff8a3d' : score >= 20 ? '#ffb020' : '#34d399';
  const r = 34, c = 2 * Math.PI * r;
  return (
    <div className="sx-gauge">
      <svg viewBox="0 0 84 84"><circle cx="42" cy="42" r={r} className="bg" /><circle cx="42" cy="42" r={r} stroke={col} strokeDasharray={`${c * score / 100} ${c}`} transform="rotate(-90 42 42)" className="fg" /></svg>
      <div><b style={{ color: col }}>{score}</b><small>/100</small></div>
      <span style={{ color: col }}>{label}</span>
    </div>
  );
}

function Drawer({ a, d, close, act }) {
  const g = a.geo || {};
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // rows that arrive while the window is open flash and are counted
  const initial = useRef(new Set(a.attempts.map(x => x.id)));
  const arrived = useRef(new Map());
  a.attempts.forEach(x => { if (!initial.current.has(x.id) && !arrived.current.has(x.id)) arrived.current.set(x.id, Date.now()); });
  const isNew = x => arrived.current.has(x.id) && now - arrived.current.get(x.id) < 5000;

  const info = useMemo(() => {
    const ua = [...a.uas][0] || '';
    const dev = parseUA(ua);
    const byMin = {}; a.attempts.forEach(x => { const k = x.created_at.slice(0, 16); byMin[k] = (byMin[k] || 0) + 1; });
    const peak = Math.max(0, ...Object.values(byMin));
    const hours = Array.from({ length: 24 }, () => ({ f: 0, o: 0, r: 0 }));
    const mins = Array.from({ length: 60 }, () => 0);
    a.attempts.forEach(x => {
      const age = Date.now() - new Date(x.created_at);
      const i = 23 - Math.floor(age / 3600e3);
      if (i >= 0 && i < 24) { if (x.success) hours[i].o++; else if (x.blocked) hours[i].r++; else hours[i].f++; }
      const m = 59 - Math.floor(age / 60e3); if (m >= 0 && m < 60) mins[m]++;
    });
    const targets = new Map();
    a.attempts.forEach(x => { if (!x.mobile) return; const t = targets.get(x.mobile) || { n: x.mobile, f: 0, o: 0, r: 0, last: x.created_at }; if (x.success) t.o++; else if (x.blocked) t.r++; else t.f++; if (x.created_at > t.last) t.last = x.created_at; targets.set(x.mobile, t); });
    const clientTz = a.attempts.map(x => x.meta?.tz).find(Boolean);
    const clientScreen = a.attempts.map(x => x.meta?.screen).find(Boolean);
    const clientLang = a.attempts.map(x => x.language || x.meta?.lang).find(Boolean);
    const tzMismatch = clientTz && g.timezone && clientTz !== g.timezone;
    const adminTries = d.adminAttempts.filter(x => x.ip === a.ip);

    // a success that follows several failures on the same number = that account may be compromised
    const asc = [...a.attempts].sort((x, y) => x.created_at.localeCompare(y.created_at));
    const taken = [];
    asc.forEach((x, i) => {
      if (!x.success || !x.mobile) return;
      const before = asc.slice(0, i).filter(y => y.mobile === x.mobile && !y.success && !y.blocked).length;
      if (before >= 3 && !taken.find(t => t.n === x.mobile)) taken.push({ n: x.mobile, before, at: x.created_at });
    });

    const score = Math.min(100, a.fails * 3 + a.targets * 5 + a.refused * 2 + peak * 2 + (dev.bot ? 20 : 0) + adminTries.length * 10 + taken.length * 25);
    const label = score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';
    const why = [];
    if (taken.length) why.push(`Logged in successfully after repeated failures on ${taken.length} number${taken.length > 1 ? 's' : ''} — possible account takeover`);
    if (a.fails >= 20) why.push(`${a.fails} failed logins — very high volume`);
    else if (a.fails >= 5) why.push(`${a.fails} failed logins — repeated password guessing`);
    else if (a.fails > 0) why.push(`${a.fails} failed login${a.fails > 1 ? 's' : ''} — could be a typo`);
    if (a.targets >= 5) why.push(`Tried ${a.targets} different numbers — credential-stuffing pattern`);
    if (peak >= 5) why.push(`Burst of ${peak} attempts within one minute`);
    if (dev.bot) why.push(`Automated tool detected (${dev.browser})`);
    if (a.refused > 0) why.push(`Kept trying after being locked out (${a.refused} refused)`);
    if (tzMismatch) why.push(`Browser timezone (${clientTz}) differs from the IP's (${g.timezone}) — possible VPN or proxy`);
    if (adminTries.length) why.push(`Also tried to sign in to the ADMIN console (${adminTries.length}×)`);
    if (!why.length) why.push('No failed attempts — looks like a normal customer');
    const advice = a.block ? 'This IP is already blocked. Review the reason and unblock it only if it was a mistake.'
      : taken.length ? 'Block this IP and reset the password of the affected number(s) right away.'
      : score >= 45 ? 'Block this IP. The behaviour matches an automated attack.'
      : score >= 20 ? 'Keep watching. Block it if it keeps failing or targets more numbers.'
      : 'No action needed.';
    return { dev, peak, hours, mins, targets: [...targets.values()].sort((x, y) => y.f - x.f), clientTz, clientScreen, clientLang, adminTries, taken, score, label, why, advice };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, d, g.timezone, Math.floor(now / 15000)]);

  // live numbers (recomputed every second)
  const st = d.settings || { max_failures: 5, window_minutes: 15, lockout_minutes: 15 };
  const winStart = now - st.window_minutes * 60e3;
  const winFails = a.attempts.filter(x => x.kind !== 'register' && !x.success && !x.blocked && new Date(x.created_at) > winStart);
  const lastFail = winFails.length ? Math.max(...winFails.map(x => +new Date(x.created_at))) : 0;
  const lockLeft = winFails.length >= st.max_failures ? Math.ceil((lastFail + st.lockout_minutes * 60e3 - now) / 1000) : 0;
  const blockLeft = a.block?.expires_at ? Math.ceil((new Date(a.block.expires_at) - now) / 1000) : null;
  const last5 = a.attempts.filter(x => now - new Date(x.created_at) < 300e3).length;
  const last60 = a.attempts.filter(x => now - new Date(x.created_at) < 3600e3).length;
  const idle = Math.max(0, Math.floor((now - new Date(a.last)) / 1000));
  const active = idle < 120;
  const clock = sec => sec >= 3600 ? `${Math.floor(sec / 3600)}h ${Math.floor(sec % 3600 / 60)}m` : `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s`;

  const hmax = Math.max(1, ...info.hours.map(h => h.f + h.o + h.r));
  const mmax = Math.max(1, ...info.mins);
  const rate = a.total ? Math.round(a.ok / a.total * 100) : 0;
  const span = Math.max(1, Math.round((new Date(a.last) - new Date(a.first)) / 60000));
  const copy = () => { navigator.clipboard?.writeText(a.ip); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const newCount = arrived.current.size;

  return <div className="sx-drawer-bg" onClick={close}><aside className="sx-drawer sx-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
    <header className="sx-d-head">
      <button className="sx-x" onClick={close} aria-label="Close"><X size={18} /></button>
      <div className="sx-d-top"><p className="sx-eyebrow">ATTACKER PROFILE</p>
        <span className={`sx-livepill ${active ? 'on' : ''}`}><i />{active ? 'ACTIVE NOW' : `idle ${clock(idle)}`}</span>
        {newCount > 0 && <span className="sx-newpill">+{newCount} new while open</span>}</div>
      <div className="sx-d-ip"><span className="sx-d-flag">{flag(g.country_code)}</span><h2><code>{a.ip}</code></h2>
        <button className="sx-copy" onClick={copy} title="Copy IP"><Copy size={14} /> {copied ? 'Copied' : 'Copy'}</button></div>
      <div className="sx-chips"><Sev s={a.sev} /><span className="sx-chip">{a.type}</span>{a.block ? <span className="sx-chip red">BLOCKED</span> : <span className="sx-chip green">not blocked</span>}{lockLeft > 0 && !a.block && <span className="sx-chip violet">🔒 locked out {clock(lockLeft)}</span>}{info.dev.bot && <span className="sx-chip amber">🤖 automated</span>}{info.taken.length > 0 && <span className="sx-chip red">⚠ possible takeover</span>}</div>
    </header>

    <div className="sx-d-body">
      <div className="sx-col">
        <section className="sx-d-risk">
          <Gauge score={info.score} label={info.label} />
          <div><h4>Why this score</h4><ul>{info.why.map(w => <li key={w}>{w}</li>)}</ul></div>
        </section>
        <div className={`sx-advice ${(info.score >= 45 || info.taken.length) && !a.block ? 'hot' : ''}`}><ShieldAlert size={16} /> <span><b>Recommended:</b> {info.advice}</span></div>

        {info.taken.length > 0 && <div className="sx-takeover">
          <b>⚠ Numbers that may be compromised</b>
          {info.taken.map(t => <div key={t.n}><code>{t.n}</code><span>logged in after {t.before} failures · {fmt(t.at)}</span></div>)}
        </div>}

        <h4>Live status</h4>
        <div className="sx-kv">
          <div><span>Last activity</span><b className="sx-live-n">{clock(idle)} ago</b></div>
          <div><span>Attempts, last 5 min</span><b className="sx-live-n">{last5}</b></div>
          <div><span>Attempts, last hour</span><b className="sx-live-n">{last60}</b></div>
          <div><span>Speed (5 min avg)</span><b className="sx-live-n">{(last5 / 5).toFixed(1)}/min</b></div>
          <div><span>Failures in window</span><b className="sx-live-n">{winFails.length} / {st.max_failures}</b></div>
          <div><span>Lockout</span><b className={lockLeft > 0 ? 'sx-hot' : ''}>{a.block ? 'Blocked' : lockLeft > 0 ? `Locked ${clock(lockLeft)}` : 'Not locked'}</b></div>
        </div>
        <div className="sx-spark small">
          <svg viewBox="0 0 240 40" preserveAspectRatio="none">{info.mins.map((n, i) => <rect key={i} x={i * 4 + .5} y={38 - n / mmax * 36} width="3" height={n / mmax * 36} className={i > 54 ? 'sx-bar-fail hot' : 'sx-bar-fail'} rx="1" />)}</svg>
          <div className="sx-chart-x"><span>60 min ago · per minute</span><span>now</span></div>
        </div>

        {a.block && <>
          <h4>Block details</h4>
          <div className="sx-kv one">
            <div><span>Reason</span><b>{a.block.reason || '—'}</b></div>
            <div><span>Type</span><b>{a.block.auto ? 'Automatic (defender)' : 'Manual (admin)'}</b></div>
            <div><span>Blocked at</span><b>{fmt(a.block.blocked_at)}</b></div>
            <div><span>Expires</span><b className={blockLeft != null ? 'sx-live-n' : ''}>{a.block.expires_at ? (blockLeft > 0 ? `in ${clock(blockLeft)}` : 'expired') : 'Never (permanent)'}</b></div>
          </div></>}

        <h4>Where is this IP?</h4>
        {g.lat != null && <MiniMap lat={g.lat} lon={g.lon} />}
        <div className="sx-kv">
          <div><span>City</span><b>{g.city || '—'}</b></div>
          <div><span>Region</span><b>{g.region || '—'}</b></div>
          <div><span>Country</span><b>{g.country || '—'}</b></div>
          <div><span>Coordinates</span><b>{g.lat != null ? `${g.lat.toFixed(3)}, ${g.lon.toFixed(3)}` : '—'}</b></div>
          <div><span>Local timezone</span><b>{g.timezone || '—'}</b></div>
          <div><span>Local time there</span><b className="sx-live-n">{g.timezone ? new Date(now).toLocaleTimeString([], { timeZone: g.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</b></div>
        </div>
        <p className="sx-hint">Approximate — it points to the provider's network, not a street address.</p>

        <h4>Network</h4>
        <div className="sx-kv">
          <div><span>ISP</span><b>{g.isp || '—'}</b></div>
          <div><span>Organisation</span><b>{g.org || '—'}</b></div>
          <div><span>ASN</span><b>{g.asn || '—'}</b></div>
          <div><span>Looked up</span><b>{g.fetched_at ? ago(g.fetched_at) : '—'}</b></div>
        </div>
      </div>

      <div className="sx-col">
        <h4 className="first">Activity</h4>
        <div className="sx-tiles">
          <div><b>{a.total}</b><span>Total</span></div>
          <div className="red"><b>{a.fails}</b><span>Failed</span></div>
          <div className="vio"><b>{a.refused}</b><span>Refused</span></div>
          <div className="grn"><b>{a.ok}</b><span>Successful</span></div>
          <div><b>{rate}%</b><span>Success rate</span></div>
          <div><b>{info.peak}</b><span>Peak / minute</span></div>
          <div><b>{a.targets}</b><span>Numbers hit</span></div>
          <div><b>{span < 60 ? `${span}m` : `${Math.round(span / 60)}h`}</b><span>Active for</span></div>
        </div>
        <div className="sx-spark">
          <svg viewBox="0 0 240 56" preserveAspectRatio="none">{info.hours.map((h, i) => {
            const sc = 50 / hmax, f = h.f * sc, o = h.o * sc, r = h.r * sc;
            return <g key={i}><rect x={i * 10 + 1} y={54 - o} width="8" height={o} className="sx-bar-ok" rx="1.5" /><rect x={i * 10 + 1} y={54 - o - f} width="8" height={f} className="sx-bar-fail" rx="1.5" /><rect x={i * 10 + 1} y={54 - o - f - r} width="8" height={r} className="sx-bar-ref" rx="1.5" /></g>;
          })}</svg>
          <div className="sx-chart-x"><span>24h ago · per hour</span><span>now</span></div>
        </div>
        <div className="sx-kv">
          <div><span>First seen</span><b>{fmt(a.first)}</b></div>
          <div><span>Last seen</span><b>{fmt(a.last)}</b></div>
        </div>

        <h4>Numbers targeted ({a.targets})</h4>
        <div className="sx-scroll"><table className="sx-table sx-mini-t">
          <thead><tr><th>Number</th><th>Failed</th><th>Refused</th><th>OK</th><th>Last try</th></tr></thead>
          <tbody>{info.targets.slice(0, 10).map(t => <tr key={t.n}><td><code>{t.n}</code></td><td className="r">{t.f}</td><td className="v">{t.r}</td><td className="g">{t.o}</td><td>{ago(t.last)}</td></tr>)}</tbody>
        </table></div>

        <h4>Device &amp; browser</h4>
        <div className="sx-kv">
          <div><span>Browser</span><b>{info.dev.browser}</b></div>
          <div><span>System</span><b>{info.dev.os}</b></div>
          <div><span>Screen</span><b>{info.clientScreen || '—'}</b></div>
          <div><span>Language</span><b>{info.clientLang || '—'}</b></div>
          <div><span>Browser timezone</span><b>{info.clientTz || '—'}</b></div>
          <div><span>Tool type</span><b>{info.dev.bot ? 'Automated / script' : 'Looks like a person'}</b></div>
        </div>
        <ul className="sx-ualist">{[...a.uas].slice(0, 3).map(u => <li key={u}>{u}</li>)}{!a.uas.size && <li>No user agent recorded</li>}</ul>

        {info.adminTries.length > 0 && <>
          <h4>⚠ Admin console attempts</h4>
          <ul className="sx-mini">{info.adminTries.slice(0, 5).map(x => <li key={x.id} className={x.success ? 'ok' : x.blocked ? 'ref' : 'fail'}><i /><span>{fmt(x.created_at)}</span><code>{x.username}</code><b>{x.success ? 'ok' : x.blocked ? 'refused' : 'failed'}</b></li>)}</ul></>}

        <h4>Live event timeline</h4>
        <ul className="sx-mini">{a.attempts.slice(0, 14).map(x => <li key={x.id} className={`${x.success ? 'ok' : x.blocked ? 'ref' : 'fail'} ${isNew(x) ? 'new' : ''}`}><i /><span>{fmt(x.created_at)}</span><code>{x.mobile || '—'}</code><b>{x.success ? 'ok' : x.blocked ? `refused · ${x.reason || ''}` : 'failed'}</b></li>)}</ul>
        {a.attempts.length > 14 && <p className="sx-hint">Latest 14 of {a.attempts.length}. The Attempt log has everything.</p>}

        <h4>Look this IP up elsewhere</h4>
        <div className="sx-links">
          <a href={`https://www.abuseipdb.com/check/${encodeURIComponent(a.ip)}`} target="_blank" rel="noreferrer noopener">AbuseIPDB <ExternalLink size={12} /></a>
          <a href={`https://www.virustotal.com/gui/ip-address/${encodeURIComponent(a.ip)}`} target="_blank" rel="noreferrer noopener">VirusTotal <ExternalLink size={12} /></a>
          <a href={`https://ipinfo.io/${encodeURIComponent(a.ip)}`} target="_blank" rel="noreferrer noopener">IPinfo <ExternalLink size={12} /></a>
        </div>
      </div>
    </div>

    <footer className="sx-d-foot">
      {a.block
        ? <button className="sx-btn" onClick={() => { act(() => api2.unblockIp(a.ip), `Unblocked ${a.ip}`); close(); }}>Unblock IP</button>
        : <>
          <button className="sx-btn danger" onClick={() => { act(() => api2.blockIp(a.ip, `Manual: ${a.type}`, 24), `Blocked ${a.ip} for 24h`); close(); }}><Ban size={15} /> Block 24h</button>
          <button className="sx-btn danger" onClick={() => { act(() => api2.blockIp(a.ip, `Manual: ${a.type}`, 168), `Blocked ${a.ip} for 7 days`); close(); }}>7 days</button>
          <button className="sx-btn danger" onClick={() => { act(() => api2.blockIp(a.ip, `Manual: ${a.type}`, null), `Blocked ${a.ip} permanently`); close(); }}>Permanent</button></>}
      <span className="sx-foot-live"><Radio size={13} /> updating live</span>
      <button className="sx-btn ghost" onClick={close}>Close</button>
    </footer>
  </aside></div>;
}

/* ---------------- login gate ---------------- */
function Gate({ onDone, denied, onSignOut }) {
  const [n, setN] = useState(''); const [p, setP] = useState(''); const [show, setShow] = useState(false);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErr('');
    if (!/^[a-z0-9._@+-]{3,60}$/.test(n)) return setErr('Enter your admin username.');
    setBusy(true);
    try { onDone(await adminLogin(n, p)); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return <div className="sx-gate"><div className="sx-gate-card">
    <div className="sx-logo big"><ShieldCheck size={30} /></div>
    <p className="sx-eyebrow">DITO SENTINEL</p><h1>Admin access</h1>
    <p className="sx-sub">Restricted area. Every login attempt is logged with IP and location.</p>
    {denied && <p className="sx-err">You're signed in, but this account isn't an administrator. <button className="sx-link" onClick={onSignOut}>Sign out</button></p>}
    <form onSubmit={submit}>
      <label>Username or email<input value={n} onChange={e => setN(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 20))} placeholder="admin" autoComplete="username" autoCapitalize="none" spellCheck={false} /></label>
      <label>Password<span className="sx-pw"><input type={show ? 'text' : 'password'} value={p} onChange={e => setP(e.target.value)} autoComplete="current-password" /><button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
      {err && <p className="sx-err">{err}</p>}
      <button className="sx-btn wide" disabled={busy}>{busy ? 'Verifying…' : 'Sign in'}</button>
    </form>
    <a className="sx-back" href="#/demo-note" onClick={e => { e.preventDefault(); location.hash = '#/admin/demo'; }}>Preview with sample data →</a>
    <a className="sx-back" href="#home" onClick={() => { location.hash = ''; }}><ArrowLeft size={13} /> Back to website</a>
  </div></div>;
}

/* ---------------- shell ---------------- */
let api2 = liveApi; // active data provider (live or demo)

const NAV = [['overview', 'Overview', LayoutDashboard], ['log', 'Attempt log', ScrollText], ['attackers', 'Attackers', Crosshair], ['blocked', 'Blocklist', Ban], ['users', 'Customers', Users], ['admins', 'Admins', ShieldCheck], ['promos', 'Offers', Package], ['settings', 'Defender rules', Settings]];

function Dashboard({ who, demo, onLogout }) {
  const [d, setD] = useState(null); const [view, setView] = useState('overview');
  const [pick, setPick] = useState(null); const [err, setErr] = useState(''); const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false); const [navOpen, setNavOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api2.load();
      setD(data); setErr('');
      const missing = [...new Set([...data.attempts, ...data.adminAttempts].map(a => a.ip).filter(ip => ip && !data.geo[ip]))];
      if (missing.length) { await api2.enrichGeo(missing); const again = await api2.load(); setD(again); }
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 10000); return () => clearInterval(t); }, [refresh]);
  // realtime: refresh the moment the database logs something (debounced so a burst is one refresh)
  useEffect(() => {
    let timer; const onEvent = () => { clearTimeout(timer); timer = setTimeout(refresh, 400); };
    const off = api2.subscribe?.(onEvent);
    return () => { clearTimeout(timer); off?.(); };
  }, [refresh]);
  // while an attacker's profile is open, poll every 3s as a backup
  useEffect(() => { if (!pick) return; const t = setInterval(refresh, 3000); return () => clearInterval(t); }, [pick, refresh]);

  const act = async (fn, msg) => {
    setBusy(true);
    try { await fn(); setToast(msg); await refresh(); } catch (e) { setToast(`Error: ${e.message}`); }
    setBusy(false); setTimeout(() => setToast(''), 3200);
  };
  const attackers = useMemo(() => d ? deriveAttackers(d.attempts, d.geo, d.blocked) : [], [d]);
  const live = pick && attackers.find(a => a.ip === pick.ip);

  return <div className="sx-app">
    <aside className={`sx-side ${navOpen ? 'open' : ''}`}>
      <div className="sx-brand"><div className="sx-logo"><ShieldCheck size={22} /></div><div><b>DITO</b><span>SENTINEL</span></div></div>
      <nav>{NAV.map(([k, label, I]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => { setView(k); setNavOpen(false); }}><I size={18} />{label}{k === 'attackers' && attackers.filter(a => a.fails >= 5 && !a.block).length > 0 && <em>{attackers.filter(a => a.fails >= 5 && !a.block).length}</em>}</button>)}</nav>
      <div className="sx-side-foot"><a href="#home" onClick={() => { location.hash = ''; }}><Globe size={16} /> View website</a><button onClick={onLogout}><LogOut size={16} /> Sign out</button></div>
    </aside>
    <main className="sx-main">
      <header className="sx-top">
        <button className="sx-burger" onClick={() => setNavOpen(!navOpen)} aria-label="Menu"><LayoutDashboard size={20} /></button>
        <div><h1>{NAV.find(n => n[0] === view)[1]}</h1><p>Protecting DITO accounts from brute-force and credential-stuffing attacks</p></div>
        <div className="sx-top-r"><span className="sx-live"><Radio size={13} /> LIVE • realtime</span><button className="sx-btn ghost sm" onClick={refresh} disabled={busy}><RefreshCw size={14} /> Refresh</button><span className="sx-who">{who}</span></div>
      </header>
      {demo && <div className="sx-demo">DEMO DATA — these are fictional records for previewing the design. Nothing here is real or stored.</div>}
      {err && <div className="sx-alert">Couldn’t load data: {err}. Did you run <code>supabase/security.sql</code>?</div>}
      {!d ? <div className="sx-loading"><span /> Loading security data…</div> : <div className="sx-content">
        {view === 'overview' && <Overview d={d} attackers={attackers} onPick={setPick} setView={setView} />}
        {view === 'log' && <AttemptLog d={d} />}
        {view === 'attackers' && <Attackers attackers={attackers} onPick={setPick} />}
        {view === 'blocked' && <Blocked d={d} act={act} />}
        {view === 'users' && <UsersView d={d} act={act} />}
        {view === 'admins' && <AdminsView d={d} act={act} me={who} />}
        {view === 'promos' && <PromosView d={d} act={act} />}
        {view === 'settings' && <SettingsView key={JSON.stringify(d.settings)} d={d} act={act} />}
      </div>}
    </main>
    {live && d && <Drawer a={live} d={d} close={() => setPick(null)} act={act} />}
    {toast && <div className="sx-toast">{toast}</div>}
  </div>;
}

export default function Admin({ demo }) {
  const [state, setState] = useState('checking'); // checking | gate | denied | in
  const [who, setWho] = useState('');
  useEffect(() => {
    if (demo) { api2 = makeDemoApi(); setWho('demo-admin'); setState('in'); return; }
    api2 = liveApi;
    (async () => {
      if (!adminSb) return setState('nosb');
      const u = await adminGetUser();
      if (!u) return setState('gate');
      setWho(u);
      setState((await isAdmin()) ? 'in' : 'denied');
    })();
  }, [demo]);

  const signOut = async () => { await adminLogout(); setState('gate'); };
  if (state === 'checking') return <div className="sx-gate"><div className="sx-loading"><span /> Checking access…</div></div>;
  if (state === 'nosb') return <div className="sx-gate"><div className="sx-gate-card"><div className="sx-logo big"><ShieldAlert size={30} /></div><h1>Supabase not connected</h1><p className="sx-sub">Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> — in <code>.env</code> locally, or in Vercel → Settings → Environment Variables — then rebuild. You can still preview the design with sample data.</p><a className="sx-btn wide" href="#/admin/demo">Open demo</a></div></div>;
  if (state === 'gate' || state === 'denied') return <Gate denied={state === 'denied'} onSignOut={signOut} onDone={n => { setWho(n); setState('in'); }} />;
  return <Dashboard who={who} demo={demo} onLogout={demo ? () => { location.hash = '#/admin'; } : signOut} />;
}
