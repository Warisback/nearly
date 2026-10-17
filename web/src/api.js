/** The contract has one transport, whether the source is the seed or the API. */
export const API_BASE = '';
const query = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
// Live by default, as the deployed App button opens plain /app. ?mock=1 reads the seed instead.
export const USE_MOCK = query.get('mock') === '1';

const FRAME_KEY = 'nearly.demo.frame.v1';
const OPTIN_KEY = 'nearly.demo.optin.v1';
const SYNC_KEY = 'nearly.demo.sync.v1';
const listeners = new Set();
const readRoutes = new Set(['api/products', 'api/live', 'api/shopper', 'api/brand', 'api/store', 'api/heatmap', 'api/price', 'api/evidence']);
const demoActions = new Set(['step', 'hero', 'reset']);

function storageGet(key) {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}

function storageSet(key, value) {
  try { window.sessionStorage.setItem(key, value); } catch { /* Private browsing still works. */ }
}

function parseFrame(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

// ?mock=1&frame=3 opens the seed on a given frame (screenshots, video takes).
let frame = USE_MOCK && query.has('frame') ? parseFrame(query.get('frame')) : parseFrame(storageGet(FRAME_KEY));
let frameCount = Infinity;
let optedIn = {};
try { optedIn = JSON.parse(storageGet(OPTIN_KEY) || '{}') || {}; } catch { /* An old session is optional. */ }
let seedPromise;

const copy = (value) => JSON.parse(JSON.stringify(value));
export const getFrame = () => frame;

/** Called immediately after a demo change; normal polling remains the UI's job. */
export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function announce(action, broadcast = true) {
  storageSet(FRAME_KEY, String(frame));
  storageSet(OPTIN_KEY, JSON.stringify(optedIn));
  if (broadcast && USE_MOCK) {
    try {
      // Only demo position is shared between tabs; no shopper credentials or visit data.
      window.localStorage.setItem(SYNC_KEY, JSON.stringify({ frame, action, nonce: Date.now() + Math.random() }));
    } catch { /* Storage is not required to run the demo. */ }
  }
  listeners.forEach((callback) => callback({ frame, action }));
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (!USE_MOCK || event.key !== SYNC_KEY || !event.newValue) return;
    try {
      const next = JSON.parse(event.newValue);
      if (!Number.isInteger(next.frame) || next.frame < 0) return;
      frame = Math.min(next.frame, frameCount - 1);
      if (next.action === 'reset') optedIn = {};
      announce(next.action, false);
    } catch { /* Ignore unrelated or malformed storage messages. */ }
  });
}

async function readJSON(response) {
  if (!response.ok) throw new Error(`Couldn't load this view (${response.status}).`);
  return response.json();
}

async function loadSeed() {
  if (!seedPromise) {
    seedPromise = fetch('mock/seed.json').then(readJSON).then((seed) => {
      if (!Array.isArray(seed.frames) || !seed.frames.length || !seed.static) {
        throw new Error('The demo seed is missing its frames.');
      }
      frameCount = seed.frames.length;
      frame = Math.min(frame, frameCount - 1);
      return seed;
    }).catch((error) => { seedPromise = undefined; throw error; });
  }
  return seedPromise;
}

function parseRoute(path, method) {
  if (typeof path !== 'string' || !/^api\/[a-z]+(?:\/[a-z]+)?(?:\?[^#]*)?$/.test(path)) {
    throw new Error('API paths must be relative to the app root.');
  }
  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  if (method === 'GET' && !readRoutes.has(pathname)) throw new Error('This view is not available.');
  if (method === 'POST' && pathname !== 'api/optin' && !demoActions.has(pathname.replace('api/demo/', ''))) {
    throw new Error('This action is not available.');
  }
  if (!['GET', 'POST'].includes(method)) throw new Error('This action is not available.');
  if (pathname === 'api/price') readCPM(params);
  return { pathname, params };
}

function readCPM(params) {
  const rawCPM = params.get('cpm') ?? '8';
  const cpm = Number(rawCPM);
  if (!rawCPM.trim() || !Number.isFinite(cpm) || cpm < 0) throw new Error('Enter a CPM of £0 or more.');
  return cpm;
}

function priceFor(seed, params) {
  const zone = params.get('zone_id');
  const cpm = readCPM(params);
  const entry = Object.entries(seed.static).find(([key, value]) => key.startsWith('api/price?') && value.zone_id === zone)?.[1];
  if (!entry) throw new Error('There is no price for this shelf yet.');
  const gbp_week = entry.views_week * cpm / 1000;
  const gbp_year_store = gbp_week * entry.endcaps * 52;
  if (!Number.isFinite(gbp_year_store)) throw new Error('Enter a smaller CPM.');
  return { ...copy(entry), cpm_gbp: cpm, gbp_week, gbp_year_store };
}

function evidenceFor(seed, ref) {
  const empty = { title: 'Source clips are not included for this total yet.', events: [], agent_run: null };
  const existing = seed.evidence?.[ref];
  const productList = seed.static['api/products']?.products || [];
  const zoneId = ref?.includes(':') ? ref.split(':')[0] : null;
  const zoneProduct = productList.find((product) => product.zone_id === zoneId);
  if (zoneId) {
    const brandView = seed.frames[frame][`api/brand?brand_id=${zoneProduct?.brand_id}`];
    const zone = brandView?.zones.find((item) => item.zone_id === zoneId);
    if (!zone || zone.hidden) return empty;
  }
  if (existing) {
    const result = copy(existing);
    result.events = result.events.filter((event) => !zoneId || (event.zone_id === zoneId && event.brand_id === zoneProduct.brand_id));
    result.events.forEach((event) => { event.shopper_id = null; });
    if (result.agent_run?.cited_event_ids.some((id) => !result.events.some((event) => event.event_id === id))) {
      result.agent_run = null;
    }
    return result;
  }
  if (zoneId) return empty; // A few sample events cannot stand in for an aggregate's lineage.
  const event = seed.frames[frame]['api/live']?.events.find((item) => item.event_id === ref);
  if (!event) return { title: 'No source clip is available for this event yet.', events: [], agent_run: null };
  const product = productList.find((item) => item.product_id === event.product_id);
  const action = { put: 'Put back', take: 'Picked up', look: 'Looked at', touch: 'Touched', cant_tell: "Can't tell from this clip" }[event.action];
  return {
    title: `${action || 'Shelf event'}${product ? ` · ${product.name}` : ''}`,
    events: [{ ...copy(event), shopper_id: null }],
    agent_run: null,
  };
}

async function mockRequest(path, pathname, params, method, body) {
  const seed = await loadSeed();
  if (method === 'POST') {
    if (pathname.startsWith('api/demo/')) {
      const action = pathname.split('/').at(-1);
      if (action === 'reset') { frame = 0; optedIn = {}; }
      if (action === 'hero') frame = Math.min(parseFrame(seed.hero_frame), seed.frames.length - 1);
      if (action === 'step') frame = Math.min(frame + 1, seed.frames.length - 1);
      announce(action);
      return { frame, label: seed.frames[frame].label };
    }
    const shopperId = body?.shopper_id;
    const route = `api/shopper?shopper_id=${shopperId}`;
    const shopper = seed.frames.map((item) => item[route]).find((item) => item?.track_id != null);
    if (!shopper) throw new Error('This visit is not in the demo. Scan the demo QR card.');
    optedIn[shopperId] = shopper.track_id;
    announce('optin', false);
    return { shopper_id: shopperId, track_id: shopper.track_id };
  }
  if (pathname === 'api/price') return priceFor(seed, params);
  let result = seed.frames[frame][path] ?? seed.static[path];
  if (result == null && pathname === 'api/evidence') return evidenceFor(seed, params.get('ref'));
  if (result == null) throw new Error('This view is not included in the demo seed.');
  result = copy(result);
  if (pathname === 'api/shopper' && Object.hasOwn(optedIn, result.shopper_id)) {
    result.opted_in = true;
    result.track_id = optedIn[result.shopper_id];
  }
  return result;
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  method = method.toUpperCase();
  const { pathname, params } = parseRoute(path, method);
  if (USE_MOCK) return mockRequest(path, pathname, params, method, body);
  const options = { method, signal, headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  return fetch(`${API_BASE}${path}`, options).then(readJSON);
}

export async function demo(action) {
  if (!demoActions.has(action)) throw new Error('This demo action is not available.');
  const result = await api(`api/demo/${action}`, { method: 'POST' });
  if (!USE_MOCK) { frame = result.frame; announce(action, false); }
  return result;
}
