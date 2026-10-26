import { PLATFORMS } from './config.mjs';
import { fetchWithTimeout } from './http.mjs';

export function discordPayload(item) {
  const platform = PLATFORMS[item.platform] || { label: item.platform, color: 0x5865f2 };
  const title = `🔴 ¡${item.user} está EN DIRECTO en ${platform.label}!`;
  const extra = item.title ? `**${String(item.title).slice(0, 180)}**\n\n` : '';
  return {
    username: '🔴 Notificador de directos',
    allowed_mentions: { parse: [] },
    embeds: [{
      title,
      description: `${extra}🎬 **Mira su transmisión:** ${item.url}`,
      color: platform.color,
      url: item.url,
      footer: { text: `${platform.label} · Aviso automático de LIVE` },
      timestamp: new Date().toISOString()
    }]
  };
}

export async function sendDiscord(webhookUrl, item, fetchImpl = fetch) {
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[^/?#]+/.test(String(webhookUrl))) {
    throw new Error('DISCORD_WEBHOOK_URL no es un webhook de Discord válido');
  }
  const res = await fetchWithTimeout(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(discordPayload(item))
  }, 7000, fetchImpl);
  if (!res.ok) throw new Error(`Discord respondió HTTP ${res.status}`);
}
