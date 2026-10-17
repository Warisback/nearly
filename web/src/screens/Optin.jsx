import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BatteryFull, Check, EyeOff, ListPlus, LoaderCircle, ShieldCheck, Signal, TriangleAlert, Undo2, Wifi } from 'lucide-react';
import { api } from '../api.js';
import './Optin.css';

// Opened from the QR card on a shopper's phone. The shopper id comes from the link and is never shown.
// States: idle (not yet) · saving · saved · declined · failed.
// Each title is two sentences, so a narrow phone breaks between them rather than mid-sentence.
const messages = {
  saved: { icon: Check, title: ['Saved.', 'Your list is ready.'], text: 'Opening your list…' },
  declined: { icon: EyeOff, title: ['No problem.', 'Nothing is saved.'], text: 'You can close this page.' },
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// The projector shows this screen in the same phone as the Shopper screen (status bar included), so saving doesn't swap phones.
const londonClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
function useClock() {
  const [now, setNow] = useState(() => londonClock.format(Date.now()));
  useEffect(() => { const timer = setInterval(() => setNow(londonClock.format(Date.now())), 15000); return () => clearInterval(timer); }, []);
  return now;
}

export default function Optin({ params, refresh }) {
  const shopperId = params?.get('shopper_id') || 'demo_07';
  const [state, setState] = useState('idle');
  const now = useClock();
  const busy = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function save() {
    if (busy.current) return;
    busy.current = true; setState('saving');
    try {
      await api('api/optin', { method: 'POST', body: { shopper_id: shopperId, qr: shopperId } });
    } catch {
      busy.current = false;
      if (alive.current) setState('failed');
      return;
    }
    if (!alive.current) return;
    setState('saved');
    // Fetch the opted-in list now and open it once it has arrived (and the "Saved" moment has shown),
    // so the phone never flashes the last poll's "Scan the QR card to start". A slow poll can't hold it past 4 s.
    const listReady = Promise.race([Promise.resolve(refresh?.()).catch(() => {}), wait(4000)]);
    await Promise.all([listReady, wait(900)]);
    if (alive.current) window.location.hash = '#/shopper';
  }
  const decline = () => { if (!busy.current) setState('declined'); };
  const reconsider = () => setState('idle');

  const ending = messages[state];
  const Icon = ending?.icon || ListPlus;
  return <main className="main optin-screen">
    <div className="optin-phone">
      <section className={`optin-card is-${state}`} aria-labelledby="optin-title">
        <div className="optin-statusbar" aria-hidden="true"><time>{now}</time><span className="optin-status-icons"><Signal size={16}/><Wifi size={16}/><BatteryFull size={21}/></span></div>
        <div className="optin-message-wrap" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={ending ? state : 'ask'} className="optin-message" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.22 }}>
              <motion.span className="optin-icon" initial={state === 'saved' ? { scale: 0.6 } : false} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }}><Icon size={30} strokeWidth={2.2}/></motion.span>
              {ending ? <><h1 id="optin-title">{ending.title[0]} <span className="optin-keep">{ending.title[1]}</span></h1><p className="optin-text">{ending.text}</p></>
                : <><h1 id="optin-title">Save what you <span className="serif">nearly</span> bought today.</h1><p className="optin-lead">Only you see it.</p></>}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="optin-actions">
          {state === 'failed' && <p className="optin-error" role="alert"><TriangleAlert size={19}/> Couldn’t save just now. Try again.</p>}
          {(state === 'idle' || state === 'saving' || state === 'failed') && <>
            <button type="button" className="optin-save" onClick={save} disabled={state === 'saving'} aria-busy={state === 'saving'}>
              {state === 'saving' ? <><LoaderCircle className="optin-spin" size={21}/> Saving…</> : <><ListPlus size={21}/> Save my list</>}
            </button>
            <button type="button" className="optin-decline" onClick={decline} disabled={state === 'saving'}>No thanks</button>
          </>}
          {state === 'declined' && <button type="button" className="optin-back" onClick={reconsider}><Undo2 size={19}/> Changed your mind?</button>}
          <p className="optin-small"><ShieldCheck size={17}/> Opt in for this visit only. No face recognition.</p>
        </div>
      </section>
    </div>
  </main>;
}
