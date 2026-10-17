import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { ShieldCheck } from 'lucide-react';
import './QrCard.css';

// The full-screen version of public/print/optin-card.html, for when nothing prints.
// The code keeps this page's query (so ?mock=1 carries over) and swaps the route for the opt-in.
const optinUrl = () => `${window.location.origin}${window.location.pathname}${window.location.search}#/optin?shopper_id=demo_07`;

export default function QrCard() {
  const canvasRef = useRef(null);
  const [url] = useState(optinUrl);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    QRCode.toCanvas(canvasRef.current, url, { width: 560, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#183e3b', light: '#ffffff' } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [url]);

  return <main className="main qrcard-screen">
    <section className="qrcard" aria-labelledby="qrcard-title">
      <h1 id="qrcard-title" className="qrcard-title">Scan to save what you <span className="serif">nearly</span> bought today.</h1>
      <div className="qrcard-code">
        <canvas ref={canvasRef} hidden={failed} role="img" aria-label="QR code: opens Nearly on your phone to save your list for this visit"/>
        {failed && <p className="qrcard-failed">Couldn’t draw the code here. <a href={url}>Open the opt-in page</a></p>}
      </div>
      <p className="qrcard-private">Only you see it.</p>
      <p className="qrcard-small"><ShieldCheck size={20}/><span>Opt in for this visit only.<br/>No face recognition.</span></p>
    </section>
  </main>;
}
