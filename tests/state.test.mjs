import test from 'node:test';
import assert from 'node:assert/strict';
import { processPresence } from '../lib/state.mjs';

function makeStore() {
  const map = new Map();
  return {
    async get(key) { return map.get(key) || null; },
    async set(key, value, opts) {
      if (opts?.onlyIfNew && map.has(key)) return { modified: false };
      map.set(key, value); return { modified: true };
    },
    async setJSON(key, value) { map.set(key, value); return { modified: true }; },
    async delete(key) { map.delete(key); },
    data: map
  };
}
const item = (live, sessionId = '') => ({ platform: 'tiktok', user: 'maria', live, sessionId, url: 'https://www.tiktok.com/@maria/live' });

test('marca primera sesión, no duplica, detecta nuevo LIVE tras offline', async () => {
  const store = makeStore(), sent = [];
  const notify = async x => sent.push(x);
  assert.equal((await processPresence(store, item(true), notify)).action, 'sent');
  assert.equal((await processPresence(store, item(true), notify)).action, 'already-announced');
  await processPresence(store, item(false), notify);
  assert.equal((await processPresence(store, item(true), notify)).action, 'sent');
  assert.equal(sent.length, 2);
});

test('identificador de sesión Twitch/Kick detecta una segunda emisión sin comprobar offline', async () => {
  const store = makeStore(), sent = [];
  const notify = async x => sent.push(x);
  await processPresence(store, { ...item(true, 'stream01'), platform: 'twitch' }, notify);
  await processPresence(store, { ...item(true, 'stream01'), platform: 'twitch' }, notify);
  await processPresence(store, { ...item(true, 'stream02'), platform: 'twitch' }, notify);
  assert.equal(sent.length, 2);
});

test('si Discord falla se deshace la marca y puede reintentarse', async () => {
  const store = makeStore(); let calls = 0;
  await assert.rejects(() => processPresence(store, item(true), async () => { calls++; throw new Error('HTTP 429'); }));
  assert.equal((await processPresence(store, item(true), async () => { calls++; })).action, 'sent');
  assert.equal(calls, 2);
});

test('estados no comprobados no alteran detección anterior', async () => {
  const store = makeStore(), sent = [];
  await processPresence(store, item(true), x => sent.push(x));
  assert.equal((await processPresence(store, { ...item(false), error:'bloqueado' }, x => sent.push(x))).action, 'error');
  assert.equal((await processPresence(store, item(true), x => sent.push(x))).action, 'already-announced');
  assert.equal(sent.length, 1);
});


test('migra estado antiguo de Starvios con stream.id persistente y permite una alerta', async () => {
  const store = makeStore(), sent = [];
  await store.setJSON('status/starvios/cr0ss', {
    live: true, sessionKey: 'id:stream-objeto-persistente', notifiedAt: '2026-10-26T10:00:00.000Z'
  });
  const starvios = { platform: 'starvios', user: 'cr0ss', live: true, sessionId: '', url: 'https://starvios.com/live/cr0ss' };
  assert.equal((await processPresence(store, starvios, x => sent.push(x))).action, 'sent');
  assert.equal((await processPresence(store, starvios, x => sent.push(x))).action, 'already-announced');
  assert.equal(sent.length, 1);
});


test('all platforms send a new alert when a reused session ID follows confirmed offline', async () => {
  for (const platform of ['tiktok', 'twitch', 'kick', 'starvios']) {
    const store = makeStore(), sent = [];
    const notify = async x => sent.push(x);
    const liveItem = { platform, user: 'channel', live: true, sessionId: 'reused-id', url: 'https://example.test/live' };
    await processPresence(store, liveItem, notify);
    assert.equal((await processPresence(store, liveItem, notify)).action, 'already-announced', `${platform} duplicate while still live`);
    await processPresence(store, { ...liveItem, live: false }, notify);
    assert.equal((await processPresence(store, liveItem, notify)).action, 'sent', `${platform} new session after offline`);
    assert.equal(sent.length, 2, `${platform} should notify twice across two sessions`);
  }
});

test('platform state errors do not reset session or trigger a false alert', async () => {
  const store = makeStore(), sent = [];
  const notify = async x => sent.push(x);
  const live = { platform: 'tiktok', user: 'maria', live: true, sessionId: '', url: 'https://tiktok.com/@maria/live' };
  assert.equal((await processPresence(store, live, notify)).action, 'sent');
  assert.equal((await processPresence(store, { ...live, live: undefined, error: 'HTTP 403' }, notify)).action, 'error');
  assert.equal((await processPresence(store, live, notify)).action, 'already-announced');
  assert.equal(sent.length, 1);
});
