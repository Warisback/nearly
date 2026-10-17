import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Info } from 'lucide-react';
import { api } from '../api.js';
import { money, number } from '../ui.jsx';
import './Price.css';

// The last screen of the demo: one shelf, one weekly figure. Nothing else competes with it.
const ZONE = 'endcap_3';
const DEFAULT_CPM = 8;
const places = { endcap_3: 'End-cap 3' };

// '8', '8.50', '£12', '1,000' -> a number. Blank, negative or anything else -> null.
function parseCpm(raw) {
  const text = String(raw ?? '').replace(/[£,\s]/g, '');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

const placeName = id => places[id] || (/^endcap_\d+$/.test(id || '') ? `End-cap ${id.split('_')[1]}` : 'This shelf');
const plural = (n, word) => `${number(n)} ${word}${n === 1 ? '' : 's'}`;
const oneDecimal = n => new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);

// £306k, £1.2m, £3.4bn: the annual figure stays short enough to read from the back of the room.
function shortMoney(n) {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1000) return `£${number(Math.round(n))}`;
  if (Math.round(n / 1000) < 1000) return `£${Math.round(n / 1000)}k`;
  const millions = Math.round(n / 1e5) / 10;
  if (millions < 1000) return `£${oneDecimal(millions)}m`;
  return `£${oneDecimal(n / 1e9)}bn`;
}

// "£8", "£12.50": the CPM as a person would say it.
const cpmText = n => (Number.isInteger(n) ? `£${number(n)}` : money(n));

export default function Price({ params }) {
  const linked = params?.get('cpm');
  const [input, setInput] = useState(() => String(parseCpm(linked) ?? DEFAULT_CPM));
  const [price, setPrice] = useState(null); // the last good figures
  const [failed, setFailed] = useState(false); // the newest valid request failed
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0), loaded = useRef(false);
  const cpm = parseCpm(input);

  // A new ?cpm= in the address bar replaces what is in the field.
  useEffect(() => { const value = parseCpm(linked); if (value != null) setInput(String(value)); }, [linked]);

  useEffect(() => {
    if (cpm == null) return undefined; // Invalid: keep the last good figures on screen.
    const id = ++latest.current;
    const timer = setTimeout(() => {
      api(`api/price?zone_id=${ZONE}&cpm=${encodeURIComponent(cpm)}`)
        .then(next => { if (id !== latest.current) return; loaded.current = true; setPrice(next); setFailed(false); })
        .catch(() => { if (id === latest.current) setFailed(true); });
    }, loaded.current ? 250 : 0);
    return () => clearTimeout(timer);
  }, [cpm, attempt]);

  const amount = price ? money(price.gbp_week) : '';
  const invalid = cpm == null;
  const note = invalid ? 'Enter a CPM of £0 or more.'
    : failed && price ? 'Couldn’t update just now. Showing the last figures.'
    : price ? `${plural(price.views_week, 'view')} at ${cpmText(price.cpm_gbp)} per 1,000.` : '';

  return <main className="main price-screen">
    <section className="price-panel" aria-labelledby="price-title">
      <div className="price-top">
        <div>
          <span className="price-eyebrow">What this shelf is worth</span>
          <h1 id="price-title" className="price-context">{placeName(price?.zone_id || ZONE)} · {price ? `${number(price.views_week)} qualified view${price.views_week === 1 ? '' : 's'} this week` : 'counting this week’s views'}</h1>
        </div>
        {price?.example && <span className="price-example"><Info size={17}/> Example numbers</span>}
      </div>

      <div className="price-figure-wrap">
        {price ? <p className="price-figure" aria-live="polite" style={{ '--chars': String(Math.max(amount.length, 4)) }}>
          <motion.span key={amount} className="price-amount" initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: 'easeOut' }}>{amount}</motion.span>
          <span className="price-per">a week</span>
        </p>
          : failed ? <div className="price-state"><p>Couldn’t price this shelf just now.</p><button type="button" className="button" onClick={() => { setFailed(false); setAttempt(a => a + 1); }}>Try again</button></div>
          : <div className="price-state" role="status"><div className="loading-bar"/><p>Pricing this shelf…</p></div>}
      </div>

      <div className="price-bottom">
        <p className="price-year">{price && <><strong>{shortMoney(price.gbp_year_store)} a year</strong> across <span className="price-keep">{plural(price.endcaps, 'end-cap')}</span> <span className="price-keep">in one store</span></>}</p>
        <div className="price-cpm">
          <label htmlFor="price-cpm-input">CPM (£ per 1,000 views)</label>
          <div className={`price-input ${invalid ? 'invalid' : ''}`}>
            <span aria-hidden="true">£</span>
            <input id="price-cpm-input" type="text" inputMode="decimal" enterKeyHint="done" autoComplete="off" spellCheck={false} maxLength={12} value={input} onChange={e => setInput(e.target.value)} aria-invalid={invalid} aria-describedby="price-cpm-note"/>
          </div>
          <p id="price-cpm-note" className={`price-note ${invalid || (failed && price) ? 'warn' : ''}`} role={invalid || (failed && price) ? 'alert' : undefined}>{note}</p>
        </div>
      </div>
    </section>
  </main>;
}
