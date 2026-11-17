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

test('alerta estilo NotifyMe incluye vista previa, mención opcional y botones', () => {
  const p = discordPayload({
    platform: 'tiktok', user: 'creador', title: 'Convoy en carretera',
    url: 'https://www.tiktok.com/@creador/live',
    thumbnailUrl: 'https://cdn.example/cover.jpg',
    avatarUrl: 'https://cdn.example/avatar.jpg',
    notifyRoleId: '123456789012345678'
  });
  assert.equal(p.username, 'NotifyMe APP');
  assert.deepEqual(p.allowed_mentions.roles, ['123456789012345678']);
  assert.equal(p.embeds[0].image.url, 'https://cdn.example/cover.jpg');
  assert.equal(p.embeds[0].author.icon_url, 'https://cdn.example/avatar.jpg');
  assert.equal(p.components[0].components[0].label, 'Watch Stream');
  assert.match(p.content, /<@&123456789012345678>/);
});
