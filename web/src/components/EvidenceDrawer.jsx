import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, ArrowUpRight, ScanLine, Layers3 } from 'lucide-react';
import { api } from '../api.js';
import { Clip, actionLabel, time, shortName, Pill, humanize } from '../ui.jsx';

export default function EvidenceDrawer({ reference, onClose, products }) {
  const [data, setData] = useState(null), [error, setError] = useState('');
  const panel = useRef(null);
  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    setData(null); setError('');
    api(`api/evidence?ref=${encodeURIComponent(reference)}`).then(d => { if (!cancelled) setData(d); }).catch(() => { if (!cancelled) setError('The evidence could not be loaded. Close this panel and try again.'); });
    return () => { cancelled = true; };
  }, [reference]);
  useEffect(() => {
    if (!reference) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = setTimeout(() => panel.current?.querySelector('button')?.focus(), 50);
    const onKey = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const items = panel.current?.querySelectorAll('button, a, input, video[controls], [tabindex="0"]');
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(focusTimer); document.body.style.overflow = overflow; window.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [reference, onClose]);
  const product = id => products.find(p => p.product_id === id);
  return <AnimatePresence>{reference && <div className="drawer-layer"><motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}/><motion.aside ref={panel} className="evidence-drawer" role="dialog" aria-modal="true" aria-labelledby="evidence-title" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 280 }}><div className="drawer-top"><span className="eyebrow"><Layers3 size={15}/> Behind the number</span><button className="icon-button" onClick={onClose} aria-label="Close evidence"><X/></button></div><h2 id="evidence-title">{data?.title ? humanize(data.title) : 'Checking the evidence'}</h2><p className="muted">From a shelf moment to a checked event.</p>{error && <p role="alert">{error}</p>}{!data && !error && <div className="loading-bar"/>}{data && <><div className="evidence-events">{data.events.length ? data.events.map(event => <article className="evidence-event" key={event.event_id}><Clip url={event.clip_url} controls/><div className="row-between"><h3>{shortName(product(event.product_id))}</h3><Pill tone={event.action === 'cant_tell' ? 'grey' : ''}>{Math.round(event.confidence * 100)}% confidence</Pill></div><div className="row-between muted"><span>{actionLabel(event.action)}</span><time>{time(event.ts)}</time></div></article>) : <div className="evidence-empty"><ScanLine/><h3>No clips linked to this yet.</h3><p>We only show clips we can trace to this number.</p></div>}</div><section className="agent-evidence"><div className="eyebrow">Agent check</div>{data.agent_run ? <><h3>{data.agent_run.model}</h3><p>{humanize(data.agent_run.summary)}</p><div className="eyebrow">Cited shelf moments</div><div className="citations">{data.agent_run.cited_event_ids.map((id, i) => { const event = data.events.find(e => e.event_id === id); return <span key={id} className="citation" title={`Source event ${i + 1}`}><ArrowUpRight size={14}/>{event ? `${actionLabel(event.action)} · ${time(event.ts)}` : `Shelf moment ${i + 1}`}</span>; })}</div></> : <p>No agent summary for this one yet.</p>}</section><div className="evidence-note"><ScanLine size={18}/><span>Clips, confidence and the agent’s reasoning stay together.</span></div></>}</motion.aside></div>}</AnimatePresence>;
}
