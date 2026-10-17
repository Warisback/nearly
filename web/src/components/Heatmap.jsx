import { useEffect, useMemo, useRef, useState } from 'react';
import './Heatmap.css';

const kindNames = { footfall: 'Footfall', dwell: 'Dwell', attention: 'Attention' };
const kindCopy = { footfall: 'Where people walked', dwell: 'Where people stopped', attention: 'Where people looked' };
const defaultPalette = { ink: '#183e3b', muted: '#6e8782', accent: '#2dbdb0', mint: '#c5f3ed', floor: '#f3faf6', fixture: '#dce7e1', heatLow: '#b5eee3', heatHigh: '#11685f' };

function paletteFrom(element) {
  if (!element) return defaultPalette;
  const style = getComputedStyle(element);
  return Object.fromEntries(Object.entries(defaultPalette).map(([key, fallback]) => [key, style.getPropertyValue(`--${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`).trim() || fallback]));
}

function rgb(hex) {
  const digits = hex.replace('#', '');
  const full = digits.length === 3 ? digits.split('').map(d => d + d).join('') : digits;
  if (!/^[0-9a-f]{6}$/i.test(full)) return [45, 189, 176];
  return [0, 2, 4].map(start => parseInt(full.slice(start, start + 2), 16));
}

function colorAt(value, max, palette) {
  const t = Math.sqrt(Math.min(value / (max || 1), 1));
  const low = rgb(palette.heatLow);
  const high = rgb(palette.heatHigh);
  return `rgb(${low.map((channel, index) => Math.round(channel + (high[index] - channel) * t)).join(',')})`;
}

export function attentionSpots(attention) {
  if (!attention?.cells) return [];
  return attention.cells.flatMap((row, y) => row.map((seconds, x) => ({ x, y, seconds })))
    .filter(cell => cell.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds || a.y - b.y || a.x - b.x)
    .slice(0, 3);
}

export function paintHeatmap(ctx, data, footfall, spots, rect, palette = defaultPalette) {
  if (!data?.cells) return;
  const cell = Math.min(rect.width / data.width, rect.height / data.height);
  const left = rect.x + (rect.width - data.width * cell) / 2;
  const top = rect.y + (rect.height - data.height * cell) / 2;
  ctx.imageSmoothingEnabled = false;
  for (let row = 0; row < data.height; row++) {
    for (let col = 0; col < data.width; col++) {
      const value = data.cells[row][col];
      const fixture = footfall?.cells?.[row]?.[col] === 0;
      ctx.fillStyle = value > 0 ? colorAt(value, data.max, palette) : fixture ? palette.fixture : palette.floor;
      ctx.fillRect(left + col * cell, top + (data.height - 1 - row) * cell, cell + .2, cell + .2);
    }
  }
  ctx.imageSmoothingEnabled = true;
  spots.forEach((spot, index) => {
    const x = left + (spot.x + .5) * cell;
    const y = top + (data.height - spot.y - .5) * cell;
    const radius = Math.max(13, cell * 1.7);
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = palette.ink; ctx.fill();
    ctx.lineWidth = Math.max(2, cell * .3); ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.font = `700 ${Math.max(12, cell * 1.6)}px Inter, Arial, sans-serif`;
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), x, y + .5);
  });
  return { left, top, cell, width: data.width * cell, height: data.height * cell };
}

function exportPNG(data, footfall, spots, palette) {
  const canvas = document.createElement('canvas');
  canvas.width = 1920; canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f3f8f4'; ctx.fillRect(0, 0, 1920, 1080);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = palette.ink; ctx.font = '600 40px Inter, Arial, sans-serif'; ctx.fillText('nearly', 90, 100);
  ctx.font = '500 76px Inter, Arial, sans-serif'; ctx.fillText(kindNames[data.kind] || data.kind, 90, 225);
  ctx.fillStyle = palette.muted; ctx.font = '30px Inter, Arial, sans-serif'; ctx.fillText(kindCopy[data.kind] || '', 94, 278);
  const map = paintHeatmap(ctx, data, footfall, spots, { x: 865, y: 72, width: 965, height: 890 }, palette);
  ctx.textAlign = 'left'; ctx.fillStyle = palette.ink; ctx.font = '500 27px Inter, Arial, sans-serif';
  ctx.fillText('Most looked-at spots', 94, 410);
  spots.forEach((spot, index) => {
    const y = 474 + index * 83;
    ctx.beginPath(); ctx.arc(113, y - 10, 20, 0, Math.PI * 2); ctx.fillStyle = palette.ink; ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'white'; ctx.font = '600 20px Inter, Arial, sans-serif'; ctx.fillText(String(index + 1), 113, y - 9);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = palette.ink; ctx.font = '26px Inter, Arial, sans-serif'; ctx.fillText(`${spot.seconds} seconds of attention`, 153, y);
  });
  const gradient = ctx.createLinearGradient(94, 0, 540, 0);
  for (let i = 0; i <= 10; i++) gradient.addColorStop(i / 10, colorAt(data.max * (i / 10), data.max, palette));
  ctx.fillStyle = gradient; ctx.fillRect(94, 790, 445, 13);
  ctx.fillStyle = palette.muted; ctx.font = '22px Inter, Arial, sans-serif'; ctx.fillText('0 s', 94, 835); ctx.fillText(`${data.max} s`, 480, 835);
  ctx.fillStyle = palette.ink; ctx.fillRect(map.left, 990, map.cell * 5 / data.cell_m, 4); ctx.font = '20px Inter, Arial, sans-serif'; ctx.fillText('5 m', map.left, 1027);
  ctx.fillStyle = palette.muted; ctx.font = '21px Inter, Arial, sans-serif'; ctx.fillText('NVIDIA synthetic store · 31 people · 13 min', 94, 957);
  if (data.error_vs_truth != null) ctx.fillText(`error vs ground truth: ${data.error_vs_truth} m`, 94, 993);
  const link = document.createElement('a');
  link.download = `heatmap-${data.kind}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export default function Heatmap({ data, footfall, attention, clean = false }) {
  const canvasRef = useRef(null);
  const mapRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [cursor, setCursor] = useState(null);
  const spots = useMemo(() => attentionSpots(attention || (data?.kind === 'attention' ? data : null)), [attention, data?.kind]);
  const palette = useRef(defaultPalette);

  useEffect(() => {
    if (!data?.cells || !canvasRef.current) return;
    const canvas = canvasRef.current;
    palette.current = paletteFrom(canvas);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    mapRef.current = paintHeatmap(ctx, data, footfall || data, spots, { x: 26, y: 26, width: canvas.width - 52, height: canvas.height - 52 }, palette.current);
    setSelected(null);
    setCursor(null);
  }, [data, footfall, spots]);

  function locate(event, persistent = false) {
    if (!mapRef.current || !data) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width * canvasRef.current.width;
    const py = (event.clientY - rect.top) / rect.height * canvasRef.current.height;
    const map = mapRef.current;
    const x = Math.floor((px - map.left) / map.cell);
    const y = data.height - 1 - Math.floor((py - map.top) / map.cell);
    if (x < 0 || y < 0 || x >= data.width || y >= data.height) { if (!persistent) setCursor(null); return; }
    const cell = { x, y, value: data.cells[y][x], left: (event.clientX - rect.left) / rect.width * 100, top: (event.clientY - rect.top) / rect.height * 100 };
    persistent ? setSelected(cell) : setCursor(cell);
  }

  function keyMove(event) {
    if (!data || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const current = selected || { x: Math.floor(data.width / 2), y: Math.floor(data.height / 2) };
    const x = Math.max(0, Math.min(data.width - 1, current.x + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0)));
    const y = Math.max(0, Math.min(data.height - 1, current.y + (event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0)));
    setSelected({ x, y, value: data.cells[y][x], left: (x + .5) / data.width * 100, top: (data.height - y - .5) / data.height * 100 });
  }

  if (!data) return <div className="heatmap-loading" role="status">Loading the store map…</div>;
  const active = cursor || selected;
  return <section className="heatmap-component" aria-label={`${kindNames[data.kind]} heatmap`}>
    <div className="heatmap-layout">
      <div className="heatmap-visual-column">
        <div className="heatmap-canvas-wrap" key={data.kind}>
          <canvas ref={canvasRef} width={780} height={920} className="heatmap-canvas" tabIndex={0}
            aria-label={`${kindNames[data.kind]}: ${data.width} by ${data.height} squares. Values from 0 to ${data.max} seconds. Use arrow keys to inspect a square.`}
            onPointerMove={event => locate(event)} onPointerLeave={() => setCursor(null)} onClick={event => locate(event, true)} onKeyDown={keyMove} />
          {active && <div className="heatmap-tooltip" role="status" style={{ left: `${Math.max(17, Math.min(83, active.left))}%`, top: `${Math.max(10, Math.min(90, active.top))}%` }}>{active.value} s in this {data.cell_m} m square</div>}
        </div>
        <div className="heatmap-scale"><span style={{ width: `${5 / (data.width * data.cell_m) * 100}%` }} /><small>5 m</small><p>{data.width * data.cell_m} × {data.height * data.cell_m} m</p></div>
      </div>
      <aside className="heatmap-key">
        <div><span className="heatmap-eyebrow">{kindNames[data.kind]}</span><h3>{kindCopy[data.kind]}</h3><p>Each square is {data.cell_m} m. Deeper colour means more time.</p></div>
        <div className="heatmap-legend" aria-label={`Square-root colour scale, 0 to ${data.max} seconds`}>
          <div className="heatmap-gradient" />
          <div><span>0 s</span><span>{data.max} s</span></div>
          <small>Time in each square</small>
        </div>
        <div className="heatmap-hotspots"><h4>Most looked-at spots</h4><ol>{spots.map((spot, index) => <li key={`${spot.x}:${spot.y}`}><span className="heatmap-pin">{index + 1}</span><span><strong>{spot.seconds} s</strong><small>of attention</small></span></li>)}</ol></div>
        <p className="heatmap-fixtures"><span />Fixtures / unvisited space</p>
        {!clean && <button type="button" className="heatmap-export" onClick={() => exportPNG(data, footfall || data, spots, palette.current)}>Export PNG <span aria-hidden="true">↗</span></button>}
      </aside>
    </div>
    <p className="heatmap-caption">NVIDIA synthetic store · 31 people · 13 min{data.error_vs_truth != null ? ` · error vs ground truth: ${data.error_vs_truth} m` : ''}</p>
  </section>;
}
