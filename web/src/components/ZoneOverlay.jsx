import { useEffect, useRef, useState } from 'react';
import initialZones from '../zones.json';
import './ZoneOverlay.css';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const actionNames = { take: 'Picked up', put: 'Put back', cant_tell: "Can't tell from this clip", look: 'Looked at', touch: 'Touched' };

export default function ZoneOverlay({ products = [], events = [] }) {
  const [zones, setZones] = useState(initialZones);
  const [editing, setEditing] = useState(false);
  const [flashes, setFlashes] = useState({});
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  const surface = useRef(null);
  const drag = useRef(null);
  const seen = useRef(new Set());
  const timers = useRef([]);
  const latest = events[0]?.event_id;

  useEffect(() => {
    const onKey = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
      if (event.key.toLowerCase() === 'z') setEditing(value => !value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const incoming = events.filter(event => !seen.current.has(event.event_id));
    seen.current = new Set(events.map(event => event.event_id));
    if (!incoming.length) { setFlashes({}); return; }
    const next = {};
    // Newest event owns the colour when multiple actions land in one zone.
    [...incoming].reverse().forEach(event => { next[event.zone_id] = event.action; });
    setFlashes(previous => ({ ...previous, ...next }));
    const timer = window.setTimeout(() => setFlashes({}), 2000);
    timers.current.push(timer);
    return () => window.clearTimeout(timer);
  }, [latest]); // Events are polled; only a new head can introduce a new event.

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  function beginDrag(event, zone, resizing = false) {
    if (!editing) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = surface.current.getBoundingClientRect();
    drag.current = { id: zone.zone_id, startX: event.clientX, startY: event.clientY, rect, zone: { ...zone }, resizing };
  }

  function moveDrag(event) {
    const active = drag.current;
    if (!active) return;
    const dx = (event.clientX - active.startX) / active.rect.width;
    const dy = (event.clientY - active.startY) / active.rect.height;
    setZones(previous => previous.map(zone => zone.zone_id !== active.id ? zone : {
      ...zone,
      ...(active.resizing ? {
        width: clamp(active.zone.width + dx, .08, 1 - active.zone.x),
        height: clamp(active.zone.height + dy, .08, 1 - active.zone.y),
      } : {
        x: clamp(active.zone.x + dx, 0, 1 - active.zone.width),
        y: clamp(active.zone.y + dy, 0, 1 - active.zone.height),
      }),
    }));
  }

  function nudge(event, zone) {
    if (!editing || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const delta = event.shiftKey ? .025 : .005;
    const dx = event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0;
    const dy = event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0;
    setZones(previous => previous.map(item => item.zone_id !== zone.zone_id ? item : {
      ...item,
      ...(event.altKey ? { width: clamp(item.width + dx, .08, 1 - item.x), height: clamp(item.height + dy, .08, 1 - item.y) }
        : { x: clamp(item.x + dx, 0, 1 - item.width), y: clamp(item.y + dy, 0, 1 - item.height) }),
    }));
  }

  const zonesJSON = JSON.stringify(zones.map(zone => Object.fromEntries(Object.entries(zone).map(([key, value]) => [key, typeof value === 'number' ? Math.round(value * 10000) / 10000 : value]))), null, 2);

  async function copyZones() {
    try {
      await navigator.clipboard.writeText(zonesJSON);
      setCopied(true);
      timers.current.push(window.setTimeout(() => setCopied(false), 2500));
    } catch {
      setCopyFallback(true);
    }
  }

  return <div ref={surface} className={`zone-overlay ${editing ? 'is-editing' : ''}`} aria-label="Shelf product zones">
    {zones.map(zone => {
      const product = products.find(item => item.zone_id === zone.zone_id);
      const action = flashes[zone.zone_id];
      return <div key={zone.zone_id}
        className={`shelf-zone ${action ? `zone-flash zone-${action}` : ''}`}
        style={{ left: `${zone.x * 100}%`, top: `${zone.y * 100}%`, width: `${zone.width * 100}%`, height: `${zone.height * 100}%` }}
        tabIndex={editing ? 0 : undefined}
        aria-label={`${zone.sticker}, ${product?.name || zone.zone_id}${action ? `, ${actionNames[action]}` : ''}${editing ? '. Arrow keys move; Alt and arrow keys resize.' : ''}`}
        onKeyDown={event => nudge(event, zone)}
        onPointerDown={event => beginDrag(event, zone)} onPointerMove={moveDrag}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <div className="zone-label"><span className="zone-sticker">{zone.sticker}</span><span className="zone-label-text"><small>{zone.zone_id}</small><strong>{product?.name || 'Shelf product'}</strong></span></div>
        {action && <span className="zone-action">{actionNames[action]}</span>}
        {editing && <button type="button" tabIndex={-1} className="zone-resize" aria-label={`Resize zone ${zone.sticker}`} onPointerDown={event => beginDrag(event, zone, true)} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }} />}
      </div>;
    })}
    {editing && <div className="zone-editor-toolbar">
      <span>Drag to align · corner to resize · Z to finish</span>
      <button type="button" onClick={copyZones}>{copied ? 'Copied' : 'Copy zones JSON'}</button>
      {copyFallback && <textarea aria-label="Zones JSON to copy" readOnly value={zonesJSON} onFocus={event => event.target.select()} />}
    </div>}
  </div>;
}
