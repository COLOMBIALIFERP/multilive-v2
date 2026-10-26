import test from 'node:test';
import assert from 'node:assert/strict';
import { performChecks } from '../lib/runner.mjs';
import { addWatched } from '../lib/watchlist.mjs';

function store() {
  const data = new Map();
  return {
    async get(key, {type} = {}) {
      if (!data.has(key)) return null;
      return type === 'json' ? structuredClone(data.get(key)) : data.get(key);
    },
    async setJSON(key, value, {onlyIfNew} = {}) {
      if (onlyIfNew && data.has(key)) return {modified:false};
      data.set(key, structuredClone(value));
      return {modified:true};
    },
    async list({prefix = ''}) {
      return {blobs: [...data.keys()].filter(key => key.startsWith(prefix)).map(key=>({key}))};
    },
    async delete(key) { data.delete(key); }
  };
}

test('una comprobación de TikTok fallida registra causa y no la marca offline', async () => {
  const s = store();
  await addWatched(s, 'tiktok', 'djcr0ss_');
  const messages = [];
  const original = console.warn;
  console.warn = (...args) => messages.push(args.join(' '));
  try {
    const results = await performChecks(s, {}, {
      tiktok: async users => users.map(user => ({platform:'tiktok',user,error:'TikTok HTTP 403'}))
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].action, 'error');
    assert.match(results[0].reason, /403/);
    assert.equal((await s.get('health/tiktok/djcr0ss_', {type:'json'})).live, null);
    assert.match(messages.join(' '), /tiktok\/@djcr0ss_.*403/);
  } finally {
    console.warn = original;
  }
});
