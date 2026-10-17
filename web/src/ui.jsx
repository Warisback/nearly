import React, { useEffect, useState } from 'react';
import { ArrowUpRight, ShieldCheck, VideoOff } from 'lucide-react';

export const money = n => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: n >= 100 ? 0 : 2, maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n);
export const number = n => new Intl.NumberFormat('en-GB').format(n);
export const time = ts => new Date(ts).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const actionLabel = action => ({ take: 'Picked up', put: 'Put back', touch: 'Touched', look: 'Looked at', cant_tell: "Can't tell from this clip" }[action] || action);
export const shortName = product => product?.name?.replace(/\s\d+(g|ml)$/, '') || 'Shelf item';
// Judges never read raw zone ids: "7 put-backs this week at B2-A" -> "… on the top shelf, left".
export const zonePlaces = { 'B2-A': 'top shelf, left', 'B2-B': 'top shelf, middle', 'B2-C': 'top shelf, right', 'B1-A': 'bottom shelf, left', 'B1-B': 'bottom shelf, middle', 'B1-C': 'bottom shelf, right' };
export const humanize = text => String(text ?? '')
  .replace(/\b(?:at|on|in) (B[12]-[ABC])\b/g, (_, id) => `on the ${zonePlaces[id]}`)
  .replace(/\bB[12]-[ABC]\b/g, id => zonePlaces[id]);
export function Logo({ small = false }) { return <a href="#/monitor" className={`logo ${small ? 'small' : ''}`} aria-label="Nearly home"><span className="logo-mark"><i/><i/></span><span>nearly<span className="logo-period">.</span></span></a>; }
export function Pill({ children, tone = '', dot = false }) { return <span className={`pill ${tone}`}>{dot && <i className="status-dot"/>}{children}</span>; }
export function Privacy({ children = 'Only your visit. Only your list.' }) { return <span className="privacy"><ShieldCheck size={15}/>{children}</span>; }
export function ScreenHeading({ eyebrow, title, text, aside }) { return <div className="screen-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{text && <p>{text}</p>}</div>{aside}</div>; }
export function Empty({ icon: Icon = VideoOff, title, text, children }) { return <div className="empty"><div className="empty-icon"><Icon size={26}/></div><h3>{title}</h3>{text && <p>{text}</p>}{children}</div>; }
export function Clip({ url, className = '', controls = false, children }) {
  const [failed, setFailed] = useState(!url);
  useEffect(() => setFailed(!url), [url]);
  return <div className={`clip ${className}`}>{url && !failed ? <video src={url} autoPlay muted loop playsInline controls={controls} onError={() => setFailed(true)} aria-label="Shelf camera clip"/> : <><img className="shelf-illustration" src="mock/shelf-scene.svg" alt="Illustration of the six product positions on the shelf"/><span className="illustration-label">{url ? 'Clip not supplied · illustrated shelf' : 'Illustrated shelf · waiting for a clip'}</span></>}{children}</div>;
}
export function TextLink({ children, onClick, href, ...rest }) { const Tag = href ? 'a' : 'button'; return <Tag href={href} onClick={onClick} className="text-link" {...rest}>{children}<ArrowUpRight size={16}/></Tag>; }
