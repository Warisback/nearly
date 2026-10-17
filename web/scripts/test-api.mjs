import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const seed = JSON.parse(await readFile(new URL('../public/mock/seed.json', import.meta.url), 'utf8'));
const storage = () => {
  const items = new Map();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)) };
};
const eventHandlers = new Map();
globalThis.window = {
  location: { search: '?mock=1' },
  sessionStorage: storage(),
  localStorage: storage(),
  addEventListener: (name, handler) => eventHandlers.set(name, handler),
};
const calls = [];
globalThis.fetch = async (path, options) => {
  calls.push({ path, options });
  assert.equal(path, 'mock/seed.json');
  return { ok: true, json: async () => structuredClone(seed) };
};

const mock = await import('../src/api.js?mock-tests');
assert.equal(mock.USE_MOCK, true);
assert.equal(mock.API_BASE, '');
assert.deepEqual(await mock.api('api/products'), seed.static['api/products']);
assert.deepEqual(await mock.api('api/live'), seed.frames[0]['api/live']);
assert.equal((await mock.api('api/shopper?shopper_id=demo_07')).opted_in, false);
assert.equal(calls.length, 1, 'Seed fetch is cached for all polls.');

let changeCount = 0;
const unsubscribe = mock.subscribe(() => { changeCount += 1; });
assert.deepEqual(await mock.api('api/optin', { method: 'POST', body: { shopper_id: 'demo_07', qr: 'demo_07' } }), { shopper_id: 'demo_07', track_id: 3 });
assert.equal(mock.getFrame(), 0, 'Opt-in must not skip a frame.');
assert.equal((await mock.api('api/shopper?shopper_id=demo_07')).opted_in, true);
assert.equal((await mock.api('api/shopper?shopper_id=demo_07')).nearly_bought.length, 0);
assert.equal((await mock.demo('step')).frame, 1);
assert.equal((await mock.demo('step')).frame, 2);
assert.equal((await mock.api('api/live')).stage, 'checking');
assert.equal((await mock.demo('hero')).frame, seed.hero_frame);
const hero = await mock.api('api/shopper?shopper_id=demo_07');
assert.equal(hero.nearly_bought[0].event_id, 'ev_0141');
assert.equal((await mock.api('api/live')).last_latency_s, 27.4);
assert.equal((await mock.api('api/brand?brand_id=walkers')).zones[0].puts, 7);
assert.equal((await mock.demo('step')).frame, 4);
assert.equal((await mock.api('api/shopper?shopper_id=demo_07')).pings.length, 1);
assert.equal((await mock.demo('step')).frame, 4, 'Stepping at the end holds the final frame.');

const price = await mock.api('api/price?zone_id=endcap_3&cpm=12.5');
assert.equal(price.cpm_gbp, 12.5);
assert.equal(price.gbp_week, 230);
assert.equal(price.gbp_year_store, 478400);
assert.equal((await mock.api('api/price?zone_id=endcap_3&cpm=0')).gbp_week, 0);
for (const cpm of ['-1', 'nope', 'Infinity', '1e308', '']) {
  await assert.rejects(mock.api(`api/price?zone_id=endcap_3&cpm=${cpm}`));
}
await assert.rejects(mock.api('api/price?zone_id=unknown&cpm=8'));

for (const kind of ['footfall', 'dwell', 'attention']) {
  const heatmap = await mock.api(`api/heatmap?kind=${kind}`);
  assert.equal(heatmap.cells.length, heatmap.height);
  assert.equal(heatmap.cells[0].length, heatmap.width);
}
const evidence = await mock.api('api/evidence?ref=B2-A%3Aputs');
assert.deepEqual(evidence, seed.evidence['B2-A:puts']);
assert(evidence.events.every((event) => event.brand_id === 'walkers' && event.shopper_id === null));
const missingAggregate = await mock.api('api/evidence?ref=B2-A:views');
assert.deepEqual(missingAggregate.events, []);
assert.equal(missingAggregate.agent_run, null, 'Missing aggregate lineage is not invented.');
assert.deepEqual((await mock.api('api/evidence?ref=B2-B:puts')).events, [], 'Hidden zones expose no evidence.');
const fallbackEvent = await mock.api('api/evidence?ref=ev_0140');
assert.equal(fallbackEvent.events[0].action, 'cant_tell');
assert.equal(fallbackEvent.agent_run, null);
assert(fallbackEvent.title.includes("Can't tell from this clip"));
assert.deepEqual((await mock.api('api/evidence?ref=missing')).events, []);

hero.nearly_bought.length = 0;
assert.equal((await mock.api('api/shopper?shopper_id=demo_07')).nearly_bought.length, 1, 'Consumers cannot mutate the seed.');
await mock.demo('reset');
assert.equal(mock.getFrame(), 0);
assert.equal((await mock.api('api/shopper?shopper_id=demo_07')).opted_in, false);
assert(changeCount >= 7, 'Frame changes notify the screen immediately.');
unsubscribe();
const oldCount = changeCount;
await mock.demo('hero');
assert.equal(changeCount, oldCount);

eventHandlers.get('storage')({ key: 'nearly.demo.sync.v1', newValue: JSON.stringify({ frame: 2, action: 'step' }) });
assert.equal(mock.getFrame(), 2, 'Demo frame updates can cross tabs.');
for (const path of ['/api/live', 'https://example.com/api/live', '../api/live', 'api/../live', 'api/live#bad']) {
  await assert.rejects(mock.api(path), /relative/);
}
await assert.rejects(mock.api('api/shopper?shopper_id=someone_else'));
await assert.rejects(mock.api('api/live', { method: 'POST' }));
await assert.rejects(mock.demo('unknown'));

window.location.search = '?mock=0';
const liveCalls = [];
globalThis.fetch = async (path, options) => {
  liveCalls.push({ path, options });
  return { ok: true, json: async () => path === 'api/demo/hero' ? { frame: 3, label: 'Hero' } : { live: true } };
};
const live = await import('../src/api.js?live-tests');
assert.equal(live.USE_MOCK, false);
assert.deepEqual(await live.api('api/live'), { live: true });
assert.equal(liveCalls[0].path, 'api/live', 'Live requests stay relative under /app.');
await live.api('api/optin', { method: 'POST', body: { shopper_id: 'demo_07', qr: 'demo_07' } });
assert.equal(liveCalls[1].options.headers['Content-Type'], 'application/json');
assert.deepEqual(JSON.parse(liveCalls[1].options.body), { shopper_id: 'demo_07', qr: 'demo_07' });
await live.demo('hero');
assert.equal(live.getFrame(), 3);
assert.equal(liveCalls[2].path, 'api/demo/hero');
assert.equal(liveCalls[2].options.method, 'POST');
await assert.rejects(live.api('api/price?zone_id=endcap_3&cpm=-1'), /CPM/);
assert.equal(liveCalls.length, 3, 'Invalid prices are rejected before a live request.');
globalThis.fetch = async () => ({ ok: false, status: 503 });
await assert.rejects(live.api('api/live'), /503/);

window.location.search = '';
const defaultMode = await import('../src/api.js?default-tests');
assert.equal(defaultMode.USE_MOCK, false, 'A normal launch (the App button opens plain /app) talks to the backend.');

window.location.search = '?mock=1&frame=3';
globalThis.fetch = async () => ({ ok: true, json: async () => structuredClone(seed) });
const framed = await import('../src/api.js?frame-tests');
assert.equal(framed.getFrame(), 3, '?frame=N opens the seed on that frame.');
assert.equal((await framed.api('api/live')).stage, 'saved');
console.log('API checks passed: seed routes, hero/reset/step, opt-in, prices, lineage, privacy, subscriptions and relative live transport.');
