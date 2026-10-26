import test from 'node:test';
import assert from 'node:assert/strict';
import { editOriginalInteraction } from '../lib/discord-commands.mjs';
import { safeDiagnostic } from '../lib/diagnostics.mjs';

const discordError = (status, code) => new Response(JSON.stringify({code, message: 'Error'}), {
  status, headers: {'content-type': 'application/json'}
});

test('Discord: un 404 temporal se reintenta sin alterar la respuesta ni el token', async () => {
  const calls = [];
  const delays = [];
  const answers = [discordError(404, 10015), discordError(404, 10015), new Response('{}', {status: 200})];
  await editOriginalInteraction('app-id', 'interaction-token', '✅ agregado', async (url, options) => {
    calls.push({url, ...options});
    return answers.shift();
  }, async ms => { delays.push(ms); });
  assert.equal(calls.length, 3);
  assert.deepEqual(delays, [400,800]);
  assert.ok(calls.every(c => c.method === 'PATCH'));
  assert.ok(calls.every(c => c.url.endsWith('/messages/@original')));
  assert.ok(calls.every(c => JSON.parse(c.body).content === '✅ agregado'));
  assert.ok(calls.every(c => JSON.stringify(JSON.parse(c.body).allowed_mentions) === '{"parse":[]}'));
});

test('Discord: no reintenta errores de credenciales 401', async () => {
  let tries = 0;
  await assert.rejects(() => editOriginalInteraction('app', 'token', 'test', async () => {
    tries++;
    return discordError(401, 50027);
  }, async () => {}), /HTTP 401 \(código 50027\)/);
  assert.equal(tries, 1);
});

test('Discord: un 404 permanente queda identificado sin exponer el token', async () => {
  let tries = 0;
  await assert.rejects(() => editOriginalInteraction('app', 'supersecret-token', 'test', async () => {
    tries++;
    return discordError(404, 10015);
  }, async () => {}), error => {
    assert.match(error.message, /HTTP 404 \(código 10015\).*tras 6 intentos/);
    assert.doesNotMatch(error.message, /supersecret-token/);
    return true;
  });
  assert.equal(tries, 6);
});

test('diagnóstico de plataforma muestra motivo pero oculta URLs y secretos', () => {
  const diagnostic = safeDiagnostic('HTTP 403 https://example.com/?token=xyz Authorization: Bearer ABC123 API_key=123 `texto`');
  assert.match(diagnostic, /HTTP 403/);
  assert.doesNotMatch(diagnostic, /example\.com|xyz|ABC123|123|`/);
});
