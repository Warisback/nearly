import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUpRight, EyeOff, MapPin, ShieldCheck } from 'lucide-react';
import { api, subscribe } from '../api.js';
import { ScreenHeading, Empty, Pill, number, shortName } from '../ui.jsx';
import ProductTile from '../components/ProductTile.jsx';
import './Brand.css';

// Human shelf places. Raw zone IDs never reach the screen.
const PLACES = {
  'B2-A': 'Top shelf, left', 'B2-B': 'Top shelf, middle', 'B2-C': 'Top shelf, right',
  'B1-A': 'Bottom shelf, left', 'B1-B': 'Bottom shelf, middle', 'B1-C': 'Bottom shelf, right',
  endcap_3: 'End-cap 3',
};
const BRANDS = { walkers: 'Walkers', pringles: 'Pringles', nestle: 'Nestlé', oreo: 'Oreo', innocent: 'Innocent' };
// `key` is both the ZoneStat field and the evidence metric: ref = `${zone_id}:${key}`.
const METRICS = [
  { key: 'views', label: 'Views', one: 'view', many: 'views' },
  { key: 'takes', label: 'Pick-ups', one: 'pick-up', many: 'pick-ups' },
  { key: 'puts', label: 'Put-backs', one: 'put-back', many: 'put-backs' },
  { key: 'put_rate', label: 'Put-back rate', rate: true },
];
const FLASH_MS = 3000;

const isNumber = n => typeof n === 'number' && Number.isFinite(n);
const percent = n => (isNumber(n) ? `${Math.round(n * 100)}%` : '—');
const display = (zone, metric) => (metric.rate ? percent(zone[metric.key]) : isNumber(zone[metric.key]) ? number(zone[metric.key]) : '—');
const points = n => `${n} ${n === 1 ? 'point' : 'points'}`;
const signed = (n, text) => `${n > 0 ? '+' : '−'}${text}`;
const deltaText = (delta, metric) => signed(delta, metric.rate ? `${Math.abs(delta)} pts` : number(Math.abs(delta)));

const nameOf = product => (product ? shortName(product) : 'your product');
const snapshot = zones => Object.fromEntries(zones.map(zone => [zone.zone_id, zone]));

// The numbers this screen last showed. Kept across visits, so a count that moved while the presenter
// was on Monitor or Shopper still flashes on arrival here. Until Brand has been on screen, the numbers
// from app start (or the last demo reset) stand in, so the first visit after the hero still shows "+1".
// A demo reset clears it: no "−1" after a rehearsal.
let lastSeen = null;
let baselineRun = 0;
function takeBaseline() {
  const run = ++baselineRun;
  // The same view App polls. Only used if Brand hasn't shown any numbers since.
  api('api/brand?brand_id=walkers')
    .then(brand => { if (run === baselineRun && !lastSeen && Array.isArray(brand?.zones)) lastSeen = snapshot(brand.zones); })
    .catch(() => { /* No baseline: the first visit just shows the numbers without a highlight. */ });
}
subscribe(({ action } = {}) => { if (action === 'reset') { lastSeen = null; takeBaseline(); } });
takeBaseline();

/** Which numbers changed since this screen last showed them, kept for FLASH_MS so the room sees them move. */
function useNumberChanges(zones, nameFor) {
  const [changes, setChanges] = useState({});
  const [flash, setFlash] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const signature = JSON.stringify(zones.map(zone => [zone.zone_id, Boolean(zone.hidden), ...METRICS.map(metric => zone[metric.key])]));
  useEffect(() => {
    if (!flash) return undefined;
    const timer = setTimeout(() => setChanges({}), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);
  useEffect(() => {
    const before = lastSeen;
    lastSeen = snapshot(zones);
    if (!before) return;
    const next = {}, lines = [];
    zones.forEach(zone => {
      const old = before[zone.zone_id];
      if (!old || old.hidden || zone.hidden) return; // Appearing from hidden is not a change in a number.
      const moved = METRICS.filter(metric => isNumber(zone[metric.key]) && isNumber(old[metric.key]) && display(zone, metric) !== display(old, metric));
      moved.forEach(metric => {
        next[`${zone.zone_id}:${metric.key}`] = metric.rate
          ? Math.round(zone[metric.key] * 100) - Math.round(old[metric.key] * 100)
          : zone[metric.key] - old[metric.key];
      });
      if (moved.length) lines.push(`${nameFor(zone)}: ${moved.map(metric => `${metric.label.toLowerCase()} now ${display(zone, metric)}`).join(', ')}.`);
    });
    if (!lines.length) return;
    setChanges(next);
    setAnnouncement(lines.join(' '));
    setFlash(count => count + 1);
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  return { changes, announcement };
}

function RollingNumber({ value }) {
  return <span className="brand-stat-value">
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span key={value} initial={{ y: '55%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '-55%', opacity: 0 }} transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}>{value}</motion.span>
    </AnimatePresence>
  </span>;
}

function Compare({ rate, category, above }) {
  // A steady scale, so a rising rate visibly grows its bar.
  const scale = Math.ceil(Math.max(rate, category, 0.2) * 20) / 20;
  const diff = Math.round(rate * 100) - Math.round(category * 100);
  const verdict = diff > 0 ? `${points(diff)} above the category.` : diff < 0 ? `${points(-diff)} below the category.` : 'Level with the category.';
  return <span className={`brand-compare ${above ? 'is-above' : ''}`}>
    <span className="brand-bar is-product"><span className="brand-bar-name">This product</span><span className="brand-bar-track"><i style={{ width: `${(rate / scale) * 100}%` }}/></span><b>{percent(rate)}</b></span>
    <span className="brand-bar is-category"><span className="brand-bar-name">Category</span><span className="brand-bar-track"><i style={{ width: `${(category / scale) * 100}%` }}/></span><b>{percent(category)}</b></span>
    <span className="brand-verdict">{verdict}</span>
  </span>;
}

function Stat({ zone, metric, name, category, change, onEvidence }) {
  const value = display(zone, metric);
  const rate = zone[metric.key];
  const compare = metric.rate && category != null && isNumber(rate);
  const above = compare && Math.round(rate * 100) > Math.round(category * 100);
  const spoken = metric.rate
    ? `Put-back rate for ${name}: ${value}${compare ? `, against ${percent(category)} for the category` : ''}.`
    : `${value} ${zone[metric.key] === 1 ? metric.one : metric.many} for ${name}.`;
  return <button type="button" className={`brand-stat brand-stat-${metric.rate ? 'rate' : metric.key} ${above ? 'is-above' : ''} ${change != null ? 'is-new' : ''}`} onClick={() => onEvidence(`${zone.zone_id}:${metric.key}`)} aria-label={`${spoken} See the evidence.`}>
    <span className="brand-label">{metric.label}</span>
    <RollingNumber value={value}/>
    {compare && <Compare rate={rate} category={category} above={above}/>}
    <span className="brand-stat-foot">See the evidence <ArrowUpRight size={16}/></span>
    <AnimatePresence>{change != null && change !== 0 && <motion.span className="brand-delta" aria-hidden="true" initial={{ opacity: 0, y: 8, scale: 0.7 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ type: 'spring', damping: 18, stiffness: 320 }}>{deltaText(change, metric)}</motion.span>}</AnimatePresence>
  </button>;
}

function ZoneCard({ zone, product, category, changes, onEvidence }) {
  const name = product?.name || 'Your product';
  const place = PLACES[zone.zone_id] || 'On the shelf';
  const head = pill => <header className="brand-card-head">
    <div className="brand-tile" aria-hidden="true">{product ? <ProductTile product={product} compact showPrice={false}/> : <span className="brand-tile-blank"/>}</div>
    <div className="brand-card-title"><h2>{name}</h2><p className="brand-place"><MapPin size={18}/>{place}</p></div>
    {pill}
  </header>;
  if (zone.hidden) {
    // Below the privacy floor: no counts at all, and nothing to open.
    return <article className="brand-card is-hidden">
      {head(<Pill tone="grey"><EyeOff size={15}/>Hidden for privacy</Pill>)}
      <div className="brand-hidden">
        <span className="brand-hidden-icon"><EyeOff size={26}/></span>
        <div><h3>Not enough shoppers yet to show this.</h3><p>Totals appear once enough shoppers have passed this shelf.</p></div>
      </div>
    </article>;
  }
  // Without a comparison the rate tile needs no extra width.
  const plain = category == null || !isNumber(zone.put_rate);
  return <article className="brand-card">
    {head(<Pill><ShieldCheck size={15}/>Totals only</Pill>)}
    <div className={`brand-stats ${plain ? 'is-plain' : ''}`}>
      {METRICS.map(metric => <Stat key={metric.key} zone={zone} metric={metric} name={nameOf(product)} category={category} change={changes[`${zone.zone_id}:${metric.key}`]} onEvidence={onEvidence}/>)}
    </div>
  </article>;
}

export default function Brand({ data, products, onEvidence }) {
  const brand = data.brand || {};
  const productFor = zone => products.find(product => product.product_id === zone.product_id);
  // Only this brand's products, even if a response ever carried more.
  const zones = (brand.zones || []).filter(zone => { const product = productFor(zone); return !product || !brand.brand_id || product.brand_id === brand.brand_id; });
  const { changes, announcement } = useNumberChanges(zones, zone => nameOf(productFor(zone)));
  const category = isNumber(brand.category_put_rate) ? brand.category_put_rate : null;
  const floor = isNumber(brand.privacy_floor) ? brand.privacy_floor : 5;
  const brandName = BRANDS[brand.brand_id] || 'Your brand';
  const anyVisible = zones.some(zone => !zone.hidden);
  // The amber key only earns its place when something on screen is amber.
  const anyAbove = category != null && zones.some(zone => !zone.hidden && isNumber(zone.put_rate) && Math.round(zone.put_rate * 100) > Math.round(category * 100));

  return <main className="main brand-screen">
    <ScreenHeading
      eyebrow={`${brandName.toUpperCase()} · YOUR PRODUCTS ONLY`}
      title={<>Your shelf, <span className="serif">counted.</span></>}
      text={`Totals for your products only. Hidden until ${floor} shoppers have passed.`}
      aside={category != null && <div className="brand-category">
        <span className="brand-label">Category put-back rate</span>
        <strong>{percent(category)}</strong>
        {anyAbove && <span className="brand-legend"><i/>Amber when yours is higher</span>}
      </div>}
    />
    {zones.length ? <>
      <div className="brand-section-head">
        <span className="eyebrow">ON THE SHELF</span>
        {anyVisible && <span className="brand-hint">Select any number to see the evidence <ArrowUpRight size={17}/></span>}
      </div>
      <div className="brand-zones">
        {zones.map(zone => <ZoneCard key={zone.zone_id} zone={zone} product={productFor(zone)} category={category} changes={changes} onEvidence={onEvidence}/>)}
      </div>
    </> : <div className="brand-card"><Empty icon={EyeOff} title="Not enough shoppers yet to show this." text="Your products appear here once shoppers have passed the shelf."/></div>}
    <p className="brand-sr" aria-live="polite">{announcement}</p>
  </main>;
}
