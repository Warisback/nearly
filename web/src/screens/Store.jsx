import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, BellOff, CalendarDays, Clock3, Eye, Footprints, Hand, Hourglass, Map as MapIcon, MapPin, PackageOpen, RefreshCw, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';
import { api } from '../api.js';
import { Empty, Pill, ScreenHeading, number, shortName, time } from '../ui.jsx';
import Heatmap from '../components/Heatmap.jsx';
import ProductTile from '../components/ProductTile.jsx';
import './Store.css';

const KINDS = [
  { id: 'footfall', label: 'Footfall', icon: Footprints },
  { id: 'dwell', label: 'Dwell', icon: Hourglass },
  { id: 'attention', label: 'Attention', icon: Eye },
];
const KIND_IDS = KINDS.map(kind => kind.id);
const PLACES = { 'B2-A': 'Top shelf, left', 'B2-B': 'Top shelf, middle', 'B2-C': 'Top shelf, right', 'B1-A': 'Bottom shelf, left', 'B1-B': 'Bottom shelf, middle', 'B1-C': 'Bottom shelf, right' };
const ALERTS = { missed_reach: { label: 'Missed reach', icon: Hand, fallback: 'A shopper reached into an empty slot.' }, gap: { label: 'Gap', icon: PackageOpen, fallback: 'There is a gap on the shelf.' } };
// "…an empty slot at B1-C (Innocent Orange Juice)." The product and place are shown right under the text.
const ZONE_PHRASE = /\s+(?:at|on|in)\s+(?:the\s+)?(?:B[12]-[ABC]|endcap_\d+)\b(?:\s*\([^)]*\))?/g;
const ZONE_ID = /\b(?:B[12]-[ABC]|endcap_\d+)\b/g;

function placeOf(zoneId) {
  if (PLACES[zoneId]) return PLACES[zoneId];
  const endcap = /^endcap_(\d+)$/.exec(zoneId || '');
  return endcap ? `End-cap ${endcap[1]}` : 'Shop floor';
}

function alertKind(kind) {
  if (ALERTS[kind]) return ALERTS[kind];
  const label = kind ? String(kind).replace(/_/g, ' ').replace(/^\w/, letter => letter.toUpperCase()) : 'Alert';
  return { label, icon: TriangleAlert, fallback: 'Something on the shelf needs a look.' };
}

function humanText(text, fallback, products = []) {
  let clean = String(text || '').replace(ZONE_PHRASE, '');
  // Never show a raw product ID such as "walkers_cheese_32g": use the product's name.
  products.forEach(item => { if (item?.product_id) clean = clean.split(item.product_id).join(shortName(item)); });
  clean = clean.replace(ZONE_ID, id => placeOf(id)).replace(/\s+([.,;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  return clean || fallback;
}

const clock = ts => (Number.isNaN(Date.parse(ts)) ? '' : time(ts));

function uplift(before, after) {
  if (before <= 0) return null;
  const change = Math.round((after - before) / before * 100);
  return { change, text: `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change)}%`, note: change > 0 ? 'more takes' : change < 0 ? 'fewer takes' : 'no change' };
}

// "Moved to eye level on Tuesday (example)" -> "moving it to eye level"
function moveClause(label) {
  const match = /^moved\s+(.+?)(?:\s+(?:on|last|this)\s+\w+)?(?:\s*\(example\))?\s*$/i.exec(String(label || '').trim());
  return match ? `moving it ${match[1]}` : 'the change';
}

// The three maps are static, so each is fetched once per session and reused across visits to this screen.
const loadedMaps = {};
const pendingMaps = {};
function loadMap(kind) {
  if (loadedMaps[kind]) return Promise.resolve(loadedMaps[kind]);
  if (!pendingMaps[kind]) {
    pendingMaps[kind] = api(`api/heatmap?kind=${kind}`).then(result => {
      if (!Array.isArray(result?.cells) || !result.width || !result.height) throw new Error('The map came back empty.');
      loadedMaps[kind] = { ...result, kind: result.kind || kind };
      return loadedMaps[kind];
    }).finally(() => { delete pendingMaps[kind]; });
  }
  return pendingMaps[kind];
}

const kindFrom = params => {
  const requested = params?.get('kind');
  return KIND_IDS.includes(requested) ? requested : 'footfall';
};

export default function Store({ data, products = [], params }) {
  const [kind, setKind] = useState(() => kindFrom(params));
  const [maps, setMaps] = useState(() => ({ ...loadedMaps }));
  const [failed, setFailed] = useState({});
  const [attempt, setAttempt] = useState(0);
  // Following a link such as #/store?kind=dwell picks that map again.
  useEffect(() => { setKind(kindFrom(params)); }, [params]);

  useEffect(() => {
    let alive = true;
    KIND_IDS.forEach(id => loadMap(id)
      .then(result => { if (alive) setMaps(current => (current[id] === result ? current : { ...current, [id]: result })); })
      .catch(() => { if (alive) setFailed(current => ({ ...current, [id]: true })); }));
    return () => { alive = false; };
  }, [attempt]);

  const choose = next => {
    setKind(next);
    try { // Keep the choice in the address so a reload lands on the same map. replaceState does not fire hashchange.
      const [route, query = ''] = window.location.hash.split('?');
      const search = new URLSearchParams(query);
      search.set('kind', next);
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${route || '#/store'}?${search}`);
    } catch { /* The map still switches. */ }
  };
  const retry = () => { setFailed({}); setAttempt(count => count + 1); };

  const settled = KIND_IDS.every(id => maps[id] || failed[id]);
  const status = maps[kind] && settled ? 'ready' : failed[kind] ? 'error' : 'loading';
  const clean = params?.get('clean') === '1' || new URLSearchParams(window.location.search).get('clean') === '1';

  const alerts = useMemo(() => {
    const list = Array.isArray(data?.store?.alerts) ? data.store.alerts : [];
    const seen = {};
    return list.map(alert => ({ ...alert, at: Date.parse(alert.ts) || 0 }))
      .sort((a, b) => b.at - a.at)
      .map(alert => {
        const base = `${alert.ts}|${alert.zone_id}|${alert.kind}`;
        seen[base] = (seen[base] || 0) + 1;
        return { ...alert, key: `${base}|${seen[base]}` };
      });
  }, [data?.store?.alerts]);

  // Alerts that arrive while this screen is open get a short "New" highlight.
  const signature = alerts.map(alert => alert.key).join('\n');
  const known = useRef(null), freshTimer = useRef();
  const [fresh, setFresh] = useState(() => new Set());
  useEffect(() => () => clearTimeout(freshTimer.current), []);
  useEffect(() => {
    const keys = signature ? signature.split('\n') : [];
    if (known.current) {
      const added = keys.filter(key => !known.current.has(key));
      if (added.length) {
        setFresh(new Set(added));
        clearTimeout(freshTimer.current);
        freshTimer.current = setTimeout(() => setFresh(new Set()), 8000);
      }
    }
    known.current = new Set(keys);
  }, [signature]);

  const move = data?.store?.before_after;
  const product = zoneId => products.find(item => item.zone_id === zoneId);

  return <main className="main store-screen">
    <ScreenHeading eyebrow="THE WHOLE FLOOR" title={<>Where people <span className="serif">linger.</span></>} text="Where shoppers walk, stop and look, and which shelf needs you now."
      aside={<div className="heading-meta"><Pill dot tone={alerts.length ? 'amber' : ''}>{alerts.length ? 'A shelf needs a hand' : 'All quiet on the shelf'}</Pill><span>Three ways to read the floor.</span></div>}/>
    <div className="store-grid">
      <section className="store-panel store-map" aria-labelledby="store-map-title">
        <div className="store-map-top">
          <div className="store-map-label"><MapIcon size={19}/><strong id="store-map-title">The shop floor</strong>{status === 'ready' && <span>Hover a square for its seconds</span>}</div>
          <div className="store-kinds" role="group" aria-label="Choose a heatmap">
            {KINDS.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`store-kind ${kind === id ? 'active' : ''}`} aria-pressed={kind === id} onClick={() => choose(id)}>
              {kind === id && <motion.span layoutId="store-kind-thumb" className="store-kind-thumb" transition={{ type: 'spring', stiffness: 520, damping: 40 }}/>}
              <Icon size={17}/><span className="store-kind-label">{label}</span>
            </button>)}
          </div>
        </div>
        {status === 'ready' ? <Heatmap data={maps[kind]} footfall={maps.footfall} attention={maps.attention} clean={clean}/>
          : status === 'error' ? <div className="store-map-error" role="alert"><Empty icon={MapIcon} title="The store map didn’t load." text="Check the connection to the store, then try again."><button type="button" className="button secondary store-retry" onClick={retry}><RefreshCw size={16}/> Try again</button></Empty></div>
          : <div className="store-map-loading" role="status"><div className="store-map-ghost" aria-hidden="true"/><div><div className="loading-bar"/><p>Loading the store map…</p></div></div>}
      </section>

      <div className="store-side">
        <section className="store-panel store-alerts" aria-labelledby="store-alerts-title">
          <div className="store-panel-heading">
            <div><span className="eyebrow">ON THE SHELF NOW</span><h2 id="store-alerts-title">Alerts</h2></div>
            {alerts.length > 0 && <Pill tone="amber">{alerts.length} to act on</Pill>}
          </div>
          <div className="store-alert-list">
            <AnimatePresence initial={false} mode="popLayout">
              {alerts.length ? alerts.map(alert => {
                const kindInfo = alertKind(alert.kind), item = product(alert.zone_id), isFresh = fresh.has(alert.key), Icon = kindInfo.icon;
                return <motion.article layout key={alert.key} className={`store-alert ${isFresh ? 'fresh' : ''}`} initial={{ opacity: 0, y: -18, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, transition: { duration: .2 } }} transition={{ duration: .45, ease: [.2, .8, .2, 1] }}>
                  <span className="store-alert-icon"><Icon size={24}/></span>
                  <div className="store-alert-body">
                    <div className="store-alert-meta"><strong>{kindInfo.label}</strong>{clock(alert.ts) && <time dateTime={alert.ts}><Clock3 size={15}/>{clock(alert.ts)}</time>}{isFresh && <span className="store-alert-new">New</span>}</div>
                    <p className="store-alert-text">{humanText(alert.text, kindInfo.fallback, products)}</p>
                    <div className="store-alert-place">{item && <ProductTile product={item} compact showPrice={false}/>}<span>{item && <strong>{shortName(item)}</strong>}<small><MapPin size={14}/>{placeOf(alert.zone_id)}</small></span></div>
                  </div>
                </motion.article>;
              }) : <motion.div key="empty" className="store-alerts-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Empty icon={BellOff} title="No alerts right now." text="Empty slots and missed reaches show up here as they happen."/></motion.div>}
            </AnimatePresence>
          </div>
        </section>

        {move && <BeforeAfter move={move} product={product(move.zone_id)}/>}
      </div>
    </div>
  </main>;
}

function BeforeAfter({ move, product }) {
  const before = Number(move.takes_before), after = Number(move.takes_after);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  const lift = uplift(before, after);
  const Trend = lift?.change < 0 ? TrendingDown : TrendingUp;
  return <section className="store-panel store-move" aria-labelledby="store-move-title">
    <div className="store-panel-heading">
      <div><span className="eyebrow">BEFORE AND AFTER</span><h2 id="store-move-title">One small <span className="serif">move.</span></h2></div>
    </div>
    <div className="store-move-product">{product && <ProductTile product={product} compact showPrice={false}/>}<div><strong>{product ? shortName(product) : placeOf(move.zone_id)}</strong>{product && <small><MapPin size={14}/>{placeOf(move.zone_id)}</small>}</div></div>
    <div className="store-move-numbers">
      <div className="store-move-number before"><strong>{number(before)}</strong><span>Takes before</span></div>
      <ArrowRight className="store-move-arrow" size={36} aria-hidden="true"/>
      <div className="store-move-number after"><strong>{number(after)}</strong><span>Takes after</span></div>
      {lift && <div className={`store-lift ${lift.change < 0 ? 'down' : ''}`}><strong><Trend size={26}/>{lift.text}</strong><span>{lift.note}</span></div>}
    </div>
    <p className="store-move-sentence">Takes went from {number(before)} to {number(after)} after {moveClause(move.label)}.</p>
    {move.label && <p className="store-move-label"><CalendarDays size={16}/>{move.label}</p>}
  </section>;
}
