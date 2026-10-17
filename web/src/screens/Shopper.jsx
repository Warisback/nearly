import './Shopper.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { BatteryFull, BellRing, Check, QrCode, ShoppingBasket, Signal, Sparkles, Trash2, Wifi } from 'lucide-react';
import { subscribe } from '../api.js';
import { Pill, Privacy, TextLink, actionLabel, money } from '../ui.jsx';
import ProductTile from '../components/ProductTile.jsx';

const FRESH_MS = 3000;
const londonClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
const clock = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : londonClock.format(date); };
const newestFirst = (a, b) => (Date.parse(b.ts) || 0) - (Date.parse(a.ts) || 0);
const pingKey = ping => `${ping.ts}|${ping.product_id}|${ping.text}`;
const ease = [0.22, 1, 0.36, 1];

// "Delete this visit" and the ping switches are UI-only, but they hold for as long as this tab is open, so leaving the
// screen and coming back can't bring a deleted list back. They end with the visit: opted_in false, a demo reset or a new
// opt-in. The hero key (G) also undeletes, so the moment can be replayed. shownAt (event_id -> when this tab first showed
// it) keeps "Just now" to 3 s from the first sight, so coming back to the screen later doesn't call it new again.
const kept = { deleted: false, alerts: {}, shownAt: new Map() };
const forgetVisit = () => { kept.deleted = false; kept.alerts = {}; kept.shownAt.clear(); };
subscribe(({ action } = {}) => { if (action === 'reset' || action === 'optin') forgetVisit(); if (action === 'hero') { kept.deleted = false; kept.shownAt.clear(); } });
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => { if (window.location.hash.startsWith('#/optin')) forgetVisit(); });

// "Ping me under £x": the Clubcard price when there is one, otherwise 10% under the shelf price, rounded down to 5p.
function pingTarget(product) {
  if (!product) return null;
  if (product.clubcard_price_gbp != null) return product.clubcard_price_gbp;
  if (!Number.isFinite(product.price_gbp)) return null;
  return Math.floor(Math.round(product.price_gbp * 100) * 9 / 50) * 5 / 100;
}

function whenLabel(event) {
  const at = clock(event.ts);
  if (event.action === 'cant_tell') return at ? `Can't tell from this clip · ${at}` : "Can't tell from this clip";
  const what = actionLabel(event.action || 'put');
  if (!at) return what;
  return / at$/.test(what) ? `${what} · ${at}` : `${what} at ${at}`; // never "Looked at at 15:02"
}

function uniqueById(list) {
  const seen = new Set();
  return (list || []).filter(item => item?.event_id && !seen.has(item.event_id) && seen.add(item.event_id));
}

// Highlights any event_id that wasn't on screen on the previous render, for 3 s. On first mount only the event the
// shelf has just saved counts, and only within 3 s of this tab first showing it, so reopening the screen later
// doesn't call old items "just now" (and StrictMode's double mount keeps the same 3 s).
function useJustLanded(ids, savedJustNow) {
  const [fresh, setFresh] = useState(() => new Set());
  const onScreen = useRef(null), timers = useRef(new Map());
  const key = ids.join('|');
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear(); onScreen.current = null; }, []);
  useEffect(() => {
    const before = onScreen.current, now = Date.now();
    onScreen.current = new Set(ids);
    const landed = []; // [event_id, ms left]
    ids.forEach(id => {
      if (before) { if (!before.has(id)) { kept.shownAt.set(id, now); landed.push([id, FRESH_MS]); } return; }
      if (!kept.shownAt.has(id)) kept.shownAt.set(id, now);
      const left = FRESH_MS - (now - kept.shownAt.get(id));
      if (id === savedJustNow && left > 0) landed.push([id, left]);
    });
    if (!landed.length) return;
    setFresh(current => new Set([...current, ...landed.map(([id]) => id)]));
    landed.forEach(([id, left]) => {
      clearTimeout(timers.current.get(id));
      timers.current.set(id, setTimeout(() => {
        timers.current.delete(id);
        setFresh(current => { const next = new Set(current); next.delete(id); return next; });
      }, left));
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return fresh;
}

function useLondonNow() {
  const [now, setNow] = useState(() => clock(Date.now()));
  useEffect(() => { const timer = setInterval(() => setNow(clock(Date.now())), 15000); return () => clearInterval(timer); }, []);
  return now;
}

// The phone's clock follows the shelf's own timeline: the newest moment in the feed or on this list. The seed and the
// scripted demo replay 15:02, and a wall clock next to "Just now · Put back at 15:02" would contradict the card.
// London wall-clock time until there is a moment.
function useStatusTime(stamps) {
  const wall = useLondonNow();
  const newest = Math.max(...stamps.map(ts => Date.parse(ts)).filter(Number.isFinite));
  return Number.isFinite(newest) ? clock(newest) : wall;
}

const stateMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
  transition: { duration: 0.32, ease },
};

function StateBlock({ icon: Icon, title, className = '', takeFocus = false, children }) {
  const block = useRef(null);
  useEffect(() => { if (takeFocus) block.current?.focus({ preventScroll: true }); }, [takeFocus]);
  return <motion.div ref={block} className={`shopper-state ${className}`} tabIndex={takeFocus ? -1 : undefined} {...stateMotion}>
    <span className="shopper-state-icon" aria-hidden="true"><Icon size={30}/></span>
    <h2>{title}</h2>
    {children}
  </motion.div>;
}

export default function Shopper({ data, products = [] }) {
  const shopper = data?.shopper || {};
  const live = data?.live;
  const optedIn = shopper.opted_in === true;
  const [visit, setVisit] = useState(() => (kept.deleted ? 'deleted' : 'kept')); // kept | confirm | deleted (UI-only)
  const [alerts, setAlerts] = useState(() => kept.alerts); // event_id -> "Ping me under £x" switched on (UI-only)
  const showing = optedIn && visit !== 'deleted';
  const items = useMemo(() => (showing ? uniqueById(shopper.nearly_bought).sort(newestFirst) : []), [showing, shopper.nearly_bought]);
  const pings = useMemo(() => (showing ? [...(shopper.pings || [])].sort(newestFirst) : []), [showing, shopper.pings]);
  const fresh = useJustLanded(items.map(event => event.event_id), live?.stage === 'saved' ? live.events?.[0]?.event_id : null);
  const now = useStatusTime([...(live?.events || []), ...items, ...pings].map(item => item?.ts));
  const trigger = useRef(null), returnFocus = useRef(false);
  const productFor = id => products.find(product => product.product_id === id);

  useEffect(() => { kept.deleted = visit === 'deleted'; }, [visit]);
  useEffect(() => { kept.alerts = alerts; }, [alerts]);
  // A demo reset (or the visit ending server-side) clears what this phone was holding.
  useEffect(() => { if (!optedIn) { setVisit('kept'); setAlerts({}); kept.shownAt.clear(); } }, [optedIn]);
  useEffect(() => subscribe(({ action } = {}) => {
    if (action === 'reset' || action === 'optin') { setVisit('kept'); setAlerts({}); }
    if (action === 'hero') setVisit(current => (current === 'deleted' ? 'kept' : current));
  }), []);
  useEffect(() => { if (visit === 'kept' && returnFocus.current) { returnFocus.current = false; trigger.current?.focus(); } }, [visit]);

  const keep = () => { returnFocus.current = true; setVisit('kept'); };
  const toggle = id => setAlerts(current => ({ ...current, [id]: !current[id] }));
  const state = !optedIn ? 'out' : visit === 'deleted' ? 'deleted' : items.length ? 'list' : 'empty';
  const landedNames = items.filter(event => fresh.has(event.event_id)).map(event => productFor(event.product_id)?.name || 'A shelf item');
  const optinHref = `#/optin?shopper_id=${encodeURIComponent(shopper.shopper_id || 'demo_07')}`;

  return <MotionConfig reducedMotion="user"><main className="main shopper-screen">
    <div className="shopper-stage">
      <div className="shopper-device">
        <div className="shopper-phone">
          <div className="shopper-statusbar" aria-hidden="true"><time>{now}</time><span className="shopper-island"/><span className="shopper-status-icons"><Signal size={16}/><Wifi size={16}/><BatteryFull size={21}/></span></div>
          <div className="shopper-appbar" aria-hidden="true"><span className="logo small"><span className="logo-mark"><i/><i/></span><span>nearly<span className="logo-period">.</span></span></span></div>
          <motion.div className="shopper-scroll" layoutScroll>
            <div className="shopper-pings" aria-live="polite">
              <AnimatePresence>
                {pings.map(ping => <motion.div key={pingKey(ping)} className="shopper-ping-wrap" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.65, ease }}>
                  <motion.div className="shopper-ping" initial={{ y: -44, scale: 0.97 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 22 }}>
                    <span className="shopper-ping-icon" aria-hidden="true"><BellRing size={20}/></span>
                    <div className="shopper-ping-copy">
                      <div className="shopper-ping-top"><strong>Nearly</strong>{clock(ping.ts) && <time dateTime={ping.ts}>{clock(ping.ts)}</time>}</div>
                      <p>{ping.text}</p>
                    </div>
                  </motion.div>
                </motion.div>)}
              </AnimatePresence>
            </div>

            <header className="shopper-heading">
              <span className="eyebrow">YOUR VISIT</span>
              <h1>Nearly bought <span className="serif">today.</span></h1>
              <Privacy/>
            </header>

            <p className="shopper-sr" aria-live="polite">{landedNames.length ? `Just now: ${landedNames.join(', ')} added to your list.` : ''}</p>

            <AnimatePresence mode="wait" initial={false}>
              {state === 'out' && <StateBlock key="out" icon={QrCode} className="is-out" title="Scan the QR card to start">
                <p className="shopper-smallprint">Opt in for this visit only. No face recognition.</p>
                <TextLink href={optinHref}>No card to hand? Opt in here</TextLink>
              </StateBlock>}

              {state === 'empty' && <StateBlock key="empty" icon={ShoppingBasket} title="Nothing nearly bought yet.">
                <p>Pick something up and put it back, and it lands here.</p>
                <Pill dot>Your list is on</Pill>
              </StateBlock>}

              {state === 'deleted' && <StateBlock key="deleted" icon={Check} title="Visit deleted." takeFocus>
                <p>Nothing from it is kept.</p>
              </StateBlock>}

              {state === 'list' && <motion.div key="list" className="shopper-list" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
                <AnimatePresence>
                  {items.map(event => {
                    const product = productFor(event.product_id);
                    const target = pingTarget(product);
                    const on = !!alerts[event.event_id];
                    const isFresh = fresh.has(event.event_id);
                    return <motion.article key={event.event_id} layout="position"
                      className={`shopper-card ${isFresh ? 'is-fresh' : ''} ${event.action === 'cant_tell' ? 'is-unsure' : ''}`}
                      initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
                      transition={{ type: 'spring', stiffness: 260, damping: 21, opacity: { duration: 0.3 } }}>
                      <div className="shopper-card-media">
                        {product ? <ProductTile product={product} showPrice={false}/> : <div className="shopper-tile-fallback"><ShoppingBasket size={30}/></div>}
                        <AnimatePresence>{isFresh && <motion.span className="shopper-fresh" initial={{ opacity: 0, y: -6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.4 } }}><Sparkles size={14} aria-hidden="true"/>Just now</motion.span>}</AnimatePresence>
                      </div>
                      <div className="shopper-card-body">
                        <h3>{product?.name || 'Shelf item'}</h3>
                        <p className="shopper-when"><i aria-hidden="true"/>{whenLabel(event)}</p>
                        {product && <div className="shopper-prices">
                          <div className="shopper-price"><span>Shelf price</span><strong>{money(product.price_gbp)}</strong></div>
                          {product.clubcard_price_gbp != null && <div className="shopper-price clubcard"><span>Clubcard</span><strong>{money(product.clubcard_price_gbp)}</strong></div>}
                        </div>}
                      </div>
                      {target != null && <div className="shopper-alert">
                        <button type="button" role="switch" aria-checked={on} className="shopper-switch-row" onClick={() => toggle(event.event_id)}>
                          <span className="shopper-switch-label"><BellRing size={18} aria-hidden="true"/>Ping me under {money(target)}</span>
                          <span className="shopper-switch" aria-hidden="true"><i/></span>
                        </button>
                        <AnimatePresence initial={false}>{on && <motion.p className="shopper-switch-note" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease }}>On. We’ll ping you here if it drops.</motion.p>}</AnimatePresence>
                      </div>}
                    </motion.article>;
                  })}
                </AnimatePresence>
              </motion.div>}
            </AnimatePresence>

            {showing && <div className="shopper-delete">
              {visit === 'confirm'
                ? <motion.div className="shopper-confirm" role="group" aria-labelledby="shopper-confirm-text" onKeyDown={e => { if (e.key === 'Escape') keep(); }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease }}>
                  <p id="shopper-confirm-text"><strong>Delete this visit?</strong> Your list and pings go too.</p>
                  <div className="shopper-confirm-actions">
                    <button type="button" className="button shopper-confirm-delete" onClick={() => setVisit('deleted')}>Delete</button>
                    <button type="button" className="button secondary shopper-confirm-keep" autoFocus onClick={keep}>Keep it</button>
                  </div>
                </motion.div>
                : <button type="button" ref={trigger} className="shopper-delete-button" onClick={() => setVisit('confirm')}><Trash2 size={18} aria-hidden="true"/>Delete this visit</button>}
            </div>}
          </motion.div>
        </div>
      </div>
    </div>
  </main></MotionConfig>;
}
