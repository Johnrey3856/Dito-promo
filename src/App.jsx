import React, { useState, useEffect } from 'react';
import * as api from './api.js';
import { Wifi, ArrowRight, Menu, X, ShieldCheck, Zap, Gift, Smartphone, Eye, EyeOff, CheckCircle2, ArrowLeft, Gamepad2, Tv, Phone, Globe, Home, Music } from 'lucide-react';

const localPromos = [
  { id: 'data-boost', category: 'Data', tag: 'DATA BOOST', title: 'More data. More doing.', desc: 'Stay connected to what matters with data offers made for your everyday.', price: '₱99', detail: '30 GB • 7 days', icon: Zap,
    perks: ['30 GB of mobile data', 'Valid for 7 days', 'Works for browsing, social apps, and video'] },
  { id: 'unli-connection', category: 'Bundles', tag: 'UNLI CONNECTION', title: 'Stream, scroll, repeat.', desc: 'Find a promo that keeps your favorite apps and people within reach.', price: '₱149', detail: 'Unli apps • 15 days', icon: Wifi,
    perks: ['Unlimited access to popular apps', 'Valid for 15 days', 'Great for streaming and chatting'] },
  { id: 'extra-value', category: 'Bundles', tag: 'EXTRA VALUE', title: 'A little more in every load.', desc: 'Discover prepaid deals and bundles that fit your budget.', price: '₱199', detail: 'Data + calls • 30 days', icon: Gift,
    perks: ['Data, calls, and texts in one bundle', 'Valid for 30 days', 'Best value for everyday use'] },
  { id: 'mega-data', category: 'Data', tag: 'MEGA DATA', title: 'Go big on data.', desc: 'A generous data allowance for heavy scrollers, streamers, and downloaders.', price: '₱299', detail: '100 GB • 30 days', icon: Globe,
    perks: ['100 GB of mobile data', 'Valid for 30 days', 'Perfect for work, school, and play'] },
  { id: 'daily-lite', category: 'Data', tag: 'DAILY LITE', title: 'Just what you need today.', desc: 'A small, budget-friendly pack for quick browsing and messaging.', price: '₱49', detail: '5 GB • 3 days', icon: Zap,
    perks: ['5 GB of mobile data', 'Valid for 3 days', 'Great for short-term top-ups'] },
  { id: 'game-zone', category: 'Entertainment', tag: 'GAME ZONE', title: 'Level up your connection.', desc: 'Low-lag data made for mobile gamers and their squads.', price: '₱129', detail: 'Game data • 15 days', icon: Gamepad2,
    perks: ['Dedicated data for popular mobile games', 'Valid for 15 days', 'Smooth play, less lag'] },
  { id: 'stream-zone', category: 'Entertainment', tag: 'STREAM ZONE', title: 'Press play, keep going.', desc: 'Binge your favorite shows, videos, and music without worry.', price: '₱179', detail: 'Streaming data • 30 days', icon: Tv,
    perks: ['Data for video and music apps', 'Valid for 30 days', 'Watch and listen anywhere'] },
  { id: 'music-pass', category: 'Entertainment', tag: 'MUSIC PASS', title: 'Your soundtrack, always on.', desc: 'Unlimited music streaming to keep the playlist going all day.', price: '₱59', detail: 'Music apps • 7 days', icon: Music,
    perks: ['Unlimited music streaming', 'Valid for 7 days', 'Works on popular music apps'] },
  { id: 'call-text', category: 'Calls & Texts', tag: 'CALL & TEXT', title: 'Talk more, worry less.', desc: 'Stay in touch with family and friends with calls and texts bundled in.', price: '₱79', detail: 'Calls + texts • 15 days', icon: Phone,
    perks: ['Unli calls and texts to DITO', 'Valid for 15 days', 'Keep close to the people who matter'] },
  { id: 'home-broadband', category: 'Bundles', tag: 'HOME FAMILY', title: 'Connection for the whole home.', desc: 'A shared bundle so everyone at home stays online together.', price: '₱499', detail: 'Family data • 30 days', icon: Home,
    perks: ['Shared data for the whole family', 'Valid for 30 days', 'Great for work-from-home and study'] }
];

const ICONS = { Zap, Wifi, Gift, Globe, Gamepad2, Tv, Phone, Home, Music };
const fromRow = r => ({ id: r.id, category: r.category, tag: r.tag, title: r.title, desc: r.description, price: r.price, detail: r.detail, icon: ICONS[r.icon] || Gift, perks: r.perks });

function PromoPage({ promo, user, onBack, onLogin, onClaimed }) {
  const Icon = promo.icon;
  const [status, setStatus] = useState('saving');
  useEffect(() => {
    if (!user) return;
    setStatus('saving');
    api.claimPromo(user, promo.id).then(() => { setStatus('saved'); onClaimed(promo.id); }).catch(() => setStatus('error'));
  }, [user, promo.id]);
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return <main className="promo-page">
    <button className="back-btn" onClick={onBack}><ArrowLeft size={16}/> Back to offers</button>
    <div className="promo-page-grid">
      <section className="promo-hero">
        <span className="promo-icon big"><Icon size={30}/></span>
        <p className="eyebrow light">{promo.tag}</p>
        <h1>{promo.title}</h1>
        <p className="hero-desc">{promo.desc}</p>
        <div className="price-row"><s>{promo.price}</s><strong>FREE</strong><span>{promo.detail}</span></div>
      </section>
      <section className="promo-panel">
        {user && status === 'error' ? <div className="success-state"><Gift size={56}/><h2>We couldn’t save your promo</h2><p>Please check your connection and try again.</p><button className="primary-btn full" onClick={onBack}>Back to offers</button></div> : user ? <div className="success-state">
          <CheckCircle2 size={56}/>
          <h2>You successfully got your promo for free!</h2>
          <p>{promo.title} ({promo.detail}) is now on {user}. Enjoy your promo!</p>
          <ul className="perk-list">{promo.perks.map(x => <li key={x}><CheckCircle2 size={17}/> {x}</li>)}</ul>
          <button className="primary-btn full" onClick={onBack}>Explore more offers <ArrowRight size={17}/></button>
        </div> : <div className="success-state">
          <Gift size={56}/>
          <h2>Your free promo is waiting</h2>
          <p>Log in or register to get {promo.title} for free.</p>
          <button className="primary-btn full" onClick={onLogin}>Log in to get it free <ArrowRight size={17}/></button>
        </div>}
        <p className="secure-note"><ShieldCheck size={14}/> Demo only — nothing is actually purchased.</p>
      </section>
    </div>
  </main>;
}

function AuthModal({ mode, onClose, onSwitch, onSuccess }) {
  const [number, setNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMessage('');
    setNotice('');
    if (!/^09\d{9}$/.test(number)) return setMessage('Enter a valid 11-digit Philippine mobile number (09XXXXXXXXX).');
    if (password.length < 8) return setMessage('Your password must be at least 8 characters.');
    if (mode === 'register' && password !== confirm) return setMessage('Your passwords do not match.');
    setBusy(true);
    try {
      if (mode === 'register') {
        await api.register(number, password);
        setPassword(''); setConfirm(''); setShowPassword(false);
        setNotice('Account created! Log in to start enjoying your promos.');
        onSwitch('login');
      } else {
        await api.login(number, password);
        setSuccess(true);
        onSuccess(number);
      }
    } catch (err) {
      setMessage(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="auth-modal" onMouseDown={e => e.stopPropagation()}>
      <button className="close-btn" onClick={onClose} aria-label="Close"><X size={20}/></button>
      <div className="modal-mark"><Wifi size={23}/></div>
      {success ? <div className="success-state">
        <CheckCircle2 size={46}/>
        <h2>Enjoy your promo!</h2>
        <p>You’re signed in. Pick an offer and make room for more.</p>
        <button className="primary-btn full" onClick={() => { onClose(); document.getElementById('offers')?.scrollIntoView({ behavior: 'smooth' }); }}>See my promos <ArrowRight size={17}/></button>
      </div> : <>
        <p className="eyebrow">{mode === 'register' ? 'JOIN THE DITO COMMUNITY' : 'GOOD TO HAVE YOU BACK'}</p>
        <h2>{mode === 'register' ? 'Create your account' : 'Log in to your account'}</h2>
        <p className="modal-sub">{mode === 'register' ? 'Register with your mobile number to get started.' : 'Enter your mobile number and password.'}</p>
        <form onSubmit={submit}>
          <label>Mobile number</label>
          <div className="field phone-field"><span>🇵🇭 +63</span><input value={number} onChange={e=>setNumber(e.target.value.replace(/\D/g,'').slice(0,11))} placeholder="09XXXXXXXXX" inputMode="numeric" required /></div>
          <label>Password</label>
          <div className="field"><input type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" required/><button type="button" className="eye-btn" aria-label={showPassword?'Hide password':'Show password'} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>
          {mode === 'register' && <><label>Confirm password</label><div className="field"><input type={showPassword?'text':'password'} value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Re-enter your password" required/></div></>}
          {notice && <p className="form-notice">{notice}</p>}
          {message && <p className="form-error">{message}</p>}
          <button className="primary-btn full" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Log in'} <ArrowRight size={17}/></button>
        </form>
        <p className="switch-auth">{mode === 'register' ? 'Already have an account?' : 'New to DITO?'} <button onClick={()=>{setMessage('');setNotice('');onSwitch(mode === 'register'?'login':'register');}}>{mode === 'register'?'Log in':'Register'}</button></p>
        <p className="secure-note"><ShieldCheck size={14}/> Demo interface — do not enter your real account password.</p>
      </>}
    </section>
  </div>
}

export default function App() {
  const [modal, setModal] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [activeTab, setActiveTab] = useState('All offers');
  const [user, setUser] = useState('');
  const [offers, setOffers] = useState(localPromos);
  const [claimed, setClaimed] = useState([]);
  const logout = () => api.logout().then(() => setUser(''));

  useEffect(() => {
    api.getUser().then(setUser);
    api.fetchPromos().then(rows => rows && setOffers(rows.map(fromRow)));
    const stopAuth = api.onAuthChange(setUser);
    // If the account/profile is deleted in the database, log this browser out.
    const check = () => api.validateSession().then(u => { if (u === '') setUser(''); });
    check();
    const timer = setInterval(check, 15000);
    window.addEventListener('focus', check);
    return () => { stopAuth(); clearInterval(timer); window.removeEventListener('focus', check); };
  }, []);
  useEffect(() => { user ? api.fetchClaimed(user).then(setClaimed) : setClaimed([]); }, [user]);
  const [selected, setSelected] = useState(null);

  // Every in-page link works from any view: leave the promo page first, then scroll to the section.
  const handleNav = e => {
    const a = e.target.closest('a[href^="#"]:not([href^="#/"])');
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute('href').slice(1);
    setSelected(null);
    setMobileMenu(false);
    setTimeout(() => id === 'home' ? window.scrollTo({ top: 0, behavior: 'smooth' }) : document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 0);
  };
  const openAuth = mode => { setModal(mode); setMobileMenu(false); };
  return <div className="site-shell" onClick={handleNav}>
    <div className="topline"><nav><a href="#why">ABOUT DITO</a><a href="#help">CAREERS</a><a href="#offers">NEWS</a><a href="#offers">BLOGS</a><a href="#home">GET APP</a><a className="eshop" href="#offers">eShop</a></nav></div>
    <header className="navbar">
      <a className="brand" href="#home" aria-label="DITO home"><span className="brand-icon"><Wifi size={23}/></span><span>DITO<span className="brand-dot">.</span></span></a>
      <nav className={mobileMenu?'nav-links open':'nav-links'}>
        <a href="#offers" onClick={()=>setMobileMenu(false)}>Mobile</a><a href="#offers" onClick={()=>setMobileMenu(false)}>Promos</a><a href="#why" onClick={()=>setMobileMenu(false)}>Rewards</a><a href="#why" onClick={()=>setMobileMenu(false)}>Why DITO</a><a href="#help" onClick={()=>setMobileMenu(false)}>Support</a>
        <div className="mobile-actions">{user
          ? <><span className="user-chip">{user.slice(0,4)}•••{user.slice(-3)}</span><button className="text-btn" onClick={()=>{logout();setMobileMenu(false);}}>Log out</button></>
          : <><button className="text-btn" onClick={()=>openAuth('login')}>Log in</button><button className="primary-btn" onClick={()=>openAuth('register')}>Register <ArrowRight size={16}/></button></>}</div>
      </nav>
      <div className="nav-actions">{user
        ? <><span className="user-chip">{user.slice(0,4)}•••{user.slice(-3)}</span><button className="text-btn" onClick={logout}>Log out</button></>
        : <><button className="text-btn" onClick={()=>openAuth('login')}>Log in</button><button className="primary-btn" onClick={()=>openAuth('register')}>Register <ArrowRight size={16}/></button></>}</div>
      <button className="menu-btn" aria-expanded={mobileMenu} onClick={()=>setMobileMenu(!mobileMenu)} aria-label="Toggle menu">{mobileMenu?<X/>:<Menu/>}</button>
    </header>

    {selected ? <PromoPage promo={selected} user={user} onClaimed={id=>setClaimed(c=>c.includes(id)?c:[...c,id])} onBack={()=>{setSelected(null);setTimeout(()=>document.getElementById('offers')?.scrollIntoView(),0);}} onLogin={()=>openAuth('login')}/> : <main id="home">
      <section className="hero">
        <div className="hero-copy">
          <div className="pill"><span className="pulse"></span> YOUR CONNECTION, YOUR WAY</div>
          <h1>Make room for<br/><span>more.</span></h1>
          <p className="hero-desc">More moments. More possibilities. More ways to stay connected. Find a DITO offer that moves with you.</p>
          <div className="hero-actions"><button className="primary-btn large" onClick={()=>document.getElementById('offers').scrollIntoView({behavior:'smooth'})}>Explore promos <ArrowRight size={18}/></button><button className="outline-btn large" onClick={()=>openAuth('register')}>Get started</button></div>
          <div className="hero-proof"><div className="proof-icon"><ShieldCheck size={17}/></div><span>Simple sign up. Easy access.</span><span className="proof-sep">•</span><span>Made for everyday connection</span></div>
        </div>
        <div className="hero-art" aria-label="Abstract mobile connectivity illustration">
          <div className="orbit orbit-one"></div><div className="orbit orbit-two"></div><div className="orbit orbit-three"></div>
          <div className="glow"></div>
          <div className="phone-card"><div className="phone-top"><span></span><span></span></div><div className="phone-screen"><div className="signal"><Wifi size={34}/></div><div className="phone-word">DITO<span>.</span></div><div className="phone-caption">CONNECTED TO MORE</div><div className="data-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div className="phone-chip">YOU'RE IN</div></div></div>
          <div className="float-tag tag-top"><Zap size={16}/> MORE DATA</div><div className="float-tag tag-bottom"><Gift size={16}/> MORE VALUE</div>
          <div className="spark spark-a">✦</div><div className="spark spark-b">✧</div>
        </div>
        <div className="hero-bottom"><span>01 / CONNECT TO MORE</span><span className="scroll-line"></span><span>SCROLL TO EXPLORE ↓</span></div>
      </section>

      <section className="quick-links">{[[Smartphone,'Get a SIM'],[Zap,'Promos'],[Gift,'Rewards'],[Wifi,'Broadband'],[ShieldCheck,'Support']].map(([I,l])=><a key={l} href={l==='Support'?'#help':l==='Rewards'?'#why':'#offers'}><span><I size={26}/></span>{l}</a>)}</section>

      <section className="offers-section" id="offers">
        <div className="section-heading"><div><p className="eyebrow">FIND YOUR NEXT FAVORITE</p><h2>Offers worth<br className="mobile-break"/> getting excited about.</h2></div><p>Whether you're streaming, sharing, or simply staying in touch — there's a deal waiting for you.</p></div>
        <div className="tabs">{['All offers','Data','Entertainment','Calls & Texts','Bundles'].map(t=><button key={t} className={activeTab===t?'active':''} onClick={()=>setActiveTab(t)}>{t}</button>)}</div>
        <div className="promo-grid">{offers.filter(p=>activeTab==='All offers'||p.category===activeTab).map(p=>{const Icon=p.icon;return <article className="promo-card" key={p.id}><div className="promo-top"><span className="promo-tag">{p.tag}{claimed.includes(p.id) && <em className="claimed-badge">CLAIMED</em>}</span><span className="promo-icon"><Icon size={21}/></span></div><h3>{p.title}</h3><p>{p.desc}</p><div className="promo-bottom"><div><strong>{p.price}</strong><small>{p.detail}</small></div><button onClick={()=>setSelected(p)} aria-label="Get this offer"><ArrowRight size={20}/></button></div></article>})}</div>
        <p className="fine-print">Promotional examples shown for website demonstration only. Actual offers, prices, inclusions, and availability may vary. Check DITO's official channels for current details.</p>
      </section>

      <section className="why-section" id="why"><div className="why-visual"><div className="big-ring"></div><div className="why-icon"><Smartphone size={45}/></div><div className="mini-label">DITO • CONNECTED</div></div><div className="why-copy"><p className="eyebrow">A BETTER WAY TO STAY IN TOUCH</p><h2>Connection that<br/>keeps up with you.</h2><p>Explore prepaid promos, manage your account, and find ways to make every connection count.</p><div className="benefit"><span><Zap size={18}/></span><div><b>Offers for your everyday</b><small>Discover options for how you connect.</small></div></div><div className="benefit"><span><ShieldCheck size={18}/></span><div><b>Your account, your control</b><small>A simple place to get started.</small></div></div><button className="primary-btn" onClick={()=>openAuth('register')}>Create your account <ArrowRight size={17}/></button></div></section>

      <section className="cta-section" id="help"><div><p className="eyebrow">READY WHEN YOU ARE</p><h2>Let's get you<br/>connected.</h2><p>Start exploring and find the offer that fits your day.</p></div><button className="light-btn" onClick={()=>openAuth('register')}>Join the community <ArrowRight size={18}/></button><div className="cta-orb"></div></section>
    </main>}
    <footer><a className="brand footer-brand" href="#home"><span className="brand-icon"><Wifi size={21}/></span><span>DITO<span className="brand-dot">.</span></span></a><span>© 2026 DITO promo concept. Independent demo website.</span><div><a href="#offers">Promos</a><a href="#why">About</a><a href="#/admin">Admin</a><button onClick={()=>openAuth('login')}>Log in</button></div></footer>
    {modal && <AuthModal mode={modal} onClose={()=>setModal('')} onSwitch={setModal} onSuccess={setUser}/>}
  </div>
}