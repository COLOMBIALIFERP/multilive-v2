import { PLATFORMS } from './config.mjs';
import { fetchWithTimeout } from './http.mjs';

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.toString() : '';
  } catch { return ''; }
}

export function discordPayload(item) {
  const platform = PLATFORMS[item.platform] || { label: item.platform, color: 0x5865f2 };
  const streamUrl = safeHttpsUrl(item.url);
  const roleId = /^\d{17,20}$/.test(String(item.notifyRoleId || ''))
    ? String(item.notifyRoleId) : '';
  const profileUrl = item.platform === 'tiktok'
    ? `https://www.tiktok.com/@${encodeURIComponent(item.user)}`
    : streamUrl.replace(/\/live(?:\?.*)?$/, '');
  const thumbnailUrl = safeHttpsUrl(item.thumbnailUrl);
  const avatarUrl = safeHttpsUrl(item.avatarUrl);
  const content = `${roleId ? `<@&${roleId}>  ⚡ | ` : ''}**${String(item.user)} está en directo!**`;
  const embed = {
    author: {
      name: `${String(item.user)} · ${platform.label}`,
      ...(avatarUrl ? { icon_url: avatarUrl } : {})
    },
    title: `🔴 ${String(item.user)} está EN DIRECTO en ${platform.label}`,
    description: `${item.title ? `**${String(item.title).slice(0, 180)}**\n\n` : ''}🎬 **Mira su transmisión:** [Abrir directo](${streamUrl})`,
    color: platform.color,
    url: streamUrl,
    footer: { text: `${platform.label} · NotifyMe APP` },
    timestamp: new Date().toISOString()
  };
  if (thumbnailUrl) embed.image = { url: thumbnailUrl };
  return {
    username: 'NotifyMe APP',
    content,
    allowed_mentions: roleId ? { parse: [], roles: [roleId] } : { parse: [] },
    embeds: [embed],
    components: [{
      type: 1,
      components: [
        { type: 2, style: 5, label: 'Watch Stream', url: streamUrl },
        { type: 2, style: 5, label: 'Ver perfil', url: profileUrl }
      ]
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
