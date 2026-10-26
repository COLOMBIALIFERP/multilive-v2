import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUsers, streamUrl } from '../lib/config.mjs';

test('usuarios: limpia @ y duplicados, ignora entradas peligrosas', () => {
  assert.deepEqual(parseUsers('@A, a, https://www.twitch.tv/B; <@everyone>, c'), ['a', 'b', 'c']);
});
test('forma enlaces correctos', () => {
  assert.equal(streamUrl('starvios', 'mario'), 'https://starvios.com/live/mario');
  assert.equal(streamUrl('tiktok', 'mario'), 'https://www.tiktok.com/@mario/live');
});
