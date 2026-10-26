import test from 'node:test';
import assert from 'node:assert/strict';
import { discordPayload, sendDiscord } from '../lib/notify.mjs';

test('mensaje de Discord con enlace, embed y sin menciones', () => {
  const p = discordPayload({ platform: 'kick', user: 'a', title: 'Prueba', url: 'https://kick.com/a' });
  assert.equal(p.allowed_mentions.parse.length, 0);
  assert.match(p.embeds[0].title, /Kick/);
  assert.equal(p.embeds[0].url, 'https://kick.com/a');
});
test('solo envía a webhook de Discord con POST', async () => {
  await assert.rejects(() => sendDiscord('https://bad.example/key', { platform: 'kick', user:'a', url:'https://kick.com/a' }));
  let called = false;
  await sendDiscord('https://discord.com/api/webhooks/1234/EXAMPLE', { platform:'kick', user:'a', url:'https://kick.com/a' }, async (_, opts) => {
    called = opts.method === 'POST'; return new Response(null, {status:204});
  });
  assert.equal(called, true);
});
