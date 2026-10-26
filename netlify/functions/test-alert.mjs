import { timingSafeEqual } from 'node:crypto';
import { sendDiscord } from '../../lib/notify.mjs';
import { streamUrl } from '../../lib/config.mjs';

function secureEquals(received, correct) {
  const a = Buffer.from(String(received || ''));
  const b = Buffer.from(String(correct || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(request) {
  if (request.method !== 'POST') return new Response('Solo POST', { status: 405 });
  const required = process.env.TEST_SECRET;
  if (!required || required.length < 20) return new Response('Configura TEST_SECRET de 20 o más caracteres', { status: 503 });
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!secureEquals(token, required)) return new Response('No autorizado', { status: 401 });
  try {
    await sendDiscord(process.env.DISCORD_WEBHOOK_URL, {
      platform: 'twitch', user: 'prueba', live: true, title: 'Mensaje de prueba desde Netlify',
      url: streamUrl('twitch', 'prueba')
    });
    return Response.json({ ok: true, message: 'Prueba enviada a Discord' });
  } catch (error) {
    console.error('Falló prueba Discord:', error.message);
    return Response.json({ ok: false, error: String(error.message || error) }, { status: 502 });
  }
}
