import React, { useState } from 'react';
import { money, shortName } from '../ui.jsx';

const brands = { walkers: ['#dcf0b4', '#45611f'], pringles: ['#f7c1b2', '#9c4830'], nestle: ['#f1c2c2', '#93464c'], oreo: ['#c8deeb', '#345d74'], innocent: ['#ffdda9', '#8b5a1e'] };
export default function ProductTile({ product, compact = false, showPrice = true }) {
  const [failed, setFailed] = useState(false);
  if (!product) return null;
  const colors = brands[product.brand_id] || ['#d9e9df', '#476453'];
  const title = shortName(product).replace(/^(Walkers|Pringles|KitKat|Oreo|Innocent)\s?/, '');
  const size = product.name.match(/\d+\s?(g|ml)|4 Finger/)?.[0];
  return <div className={`product-tile ${compact ? 'compact' : ''}`} style={{ '--product-color': colors[0], '--product-ink': colors[1] }}>
    {!failed ? <img src={`products/${product.product_id}.jpg`} alt={product.name} onError={() => setFailed(true)}/> : <div className="product-type"><span className="product-brand">{product.brand_id === 'nestle' ? 'KitKat' : product.brand_id}</span><strong>{title}</strong><span className="product-bottom">{size && size !== title ? size : 'On your shelf'}{showPrice && <b>{money(product.price_gbp)}</b>}</span></div>}
  </div>;
}
