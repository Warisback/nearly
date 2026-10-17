import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { api, demo, subscribe, USE_MOCK } from './api.js';
import { Logo } from './ui.jsx';
import Monitor from './screens/Monitor.jsx';
import Shopper from './screens/Shopper.jsx';
import Brand from './screens/Brand.jsx';
import Store from './screens/Store.jsx';
import Price from './screens/Price.jsx';
import Optin from './screens/Optin.jsx';
import QrCard from './screens/QrCard.jsx';
import EvidenceDrawer from './components/EvidenceDrawer.jsx';

const getRoute = () => (window.location.hash.split('?')[0].replace('#/', '') || 'monitor');
const getParams = () => new URLSearchParams(window.location.hash.split('?')[1] || '');
const tabs = ['monitor', 'shopper', 'brand', 'store', 'price'];
const screens = { monitor: Monitor, shopper: Shopper, brand: Brand, store: Store, price: Price, optin: Optin, qr: QrCard };
const viewingAs = { monitor: 'Monitor', brand: 'Brand · Walkers', store: 'Store', price: 'Store' };
const phoneRoutes = new Set(['shopper', 'optin', 'qr']);
// These screens fetch what they need themselves, so they never wait on the shelf polls.
const dataFreeRoutes = new Set(['optin', 'qr', 'price']);

export default function App() {
  const [route, setRoute] = useState(getRoute), [params, setParams] = useState(getParams);
  const [data, setData] = useState(null), [error, setError] = useState(''), [reference, setReference] = useState(null);
  const closeEvidence = useCallback(() => setReference(null), []);
  // Polls can finish out of order (e.g. one sent before a reset lands after it): never apply an older one.
  const pollCount = useRef(0), appliedPoll = useRef(0);
  const refresh = useCallback(async () => {
    const poll = ++pollCount.current;
    try {
      const [products, live, shopper, brand, store] = await Promise.all(['api/products', 'api/live', 'api/shopper?shopper_id=demo_07', 'api/brand?brand_id=walkers', 'api/store'].map(path => api(path)));
      if (poll < appliedPoll.current) return;
      appliedPoll.current = poll;
      setData({ products: products.products, live, shopper, brand, store }); setError('');
    } catch (e) { if (poll >= appliedPoll.current) setError('The shelf connection paused. We’ll try again in a moment.'); }
  }, []);
  useEffect(() => { refresh(); const interval = setInterval(refresh, 2000); const unsubscribe = subscribe(refresh); return () => { clearInterval(interval); unsubscribe(); }; }, [refresh]);
  useEffect(() => { const hashChange = () => { setRoute(getRoute()); setParams(getParams()); setReference(null); window.scrollTo(0, 0); }; window.addEventListener('hashchange', hashChange); return () => window.removeEventListener('hashchange', hashChange); }, []);
  useEffect(() => { const onKey = async e => { if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input,textarea,select,[contenteditable="true"]')) return; const action = {l:'step',g:'hero',r:'reset'}[e.key.toLowerCase()]; if (action) { e.preventDefault(); try { await demo(action); closeEvidence(); refresh(); } catch { setError('The demo controls could not reach the server. Try again.'); } } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [closeEvidence, refresh]);

  const phone = phoneRoutes.has(route);
  const Screen = screens[route] || Monitor;
  return <div className={`app route-${route}`}>
    <header className={phone ? 'personal-header' : 'app-header'}><Logo/>{!phone && <nav aria-label="Main navigation">{tabs.map(item => <a key={item} href={`#/${item}`} aria-current={route === item ? 'page' : undefined}>{item[0].toUpperCase()+item.slice(1)}</a>)}</nav>}<div className="header-end">{phone ? <a className="quiet-link" href="#/monitor">Back to the shelf <ArrowUpRight size={15}/></a> : <><span className="header-status"><i className="status-dot"/>{USE_MOCK ? 'Demo store' : 'Connected store'}</span><span className="avatar">{route === 'brand' ? 'W' : 'N'}</span></>}</div></header>
    {!phone && <div className="context-bar"><span>ONE SHELF. A FULLER PICTURE.</span><span>Viewing as: {viewingAs[route] || 'Monitor'}</span></div>}
    {error && <div className="error-banner" role="alert">{error}<button onClick={refresh}><RefreshCw size={14}/> Retry</button></div>}
    {!data && !dataFreeRoutes.has(route) ? <div className="app-loading"><Logo/><p>Getting the shelf ready…</p><div className="loading-bar"/></div> : <Screen data={data} products={data?.products || []} onEvidence={setReference} params={params} refresh={refresh}/>}
    {!phone && <footer className="app-footer"><span>nearly. <span>Every almost matters.</span></span><span>Built around the moment.</span></footer>}
    <EvidenceDrawer reference={reference} onClose={closeEvidence} products={data?.products || []}/>
  </div>;
}
