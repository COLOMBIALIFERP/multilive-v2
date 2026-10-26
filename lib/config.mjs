/** Configuración de listas y URLs, sin secretos visibles para el navegador. */
export const PLATFORMS = Object.freeze({
  twitch: { label: 'Twitch', color: 0x9146ff },
  kick: { label: 'Kick', color: 0x53fc18 },
  tiktok: { label: 'TikTok', color: 0x25f4ee },
  starvios: { label: 'Starvios', color: 0xffb841 }
});

export function parseUsers(raw) {
  const unique = new Set();
  for (const item of String(raw ?? '').split(/[\s,;]+/)) {
    let handle = item.trim().replace(/^@/, '');
    // URLs comunes; ignorar dominios y rutas desconocidos.
    if (/^https?:\/\//i.test(handle)) {
      try {
        const u = new URL(handle);
        const path = u.pathname.split('/').filter(Boolean);
        handle = path[0] === 'live' ? path[1] : path[0];
      } catch { continue; }
      handle = String(handle ?? '').replace(/^@/, '');
    }
    if (!/^[a-z\d_.-]{1,32}$/i.test(handle)) continue;
    unique.add(handle.toLowerCase());
  }
  return [...unique].slice(0, 6); // 6 por plataforma: se evita exceder los 30s de Netlify.
}

export function streamUrl(platform, handle) {
  const h = encodeURIComponent(handle);
  const urls = {
    twitch: `https://www.twitch.tv/${h}`,
    kick: `https://kick.com/${h}`,
    tiktok: `https://www.tiktok.com/@${h}/live`,
    starvios: `https://starvios.com/live/${h}`
  };
  return urls[platform] ?? '';
}

export function usersFromEnv(env = process.env) {
  return {
    twitch: parseUsers(env.TWITCH_USERS),
    kick: parseUsers(env.KICK_USERS),
    tiktok: parseUsers(env.TIKTOK_USERS),
    starvios: parseUsers(env.STARVIOS_USERS)
  };
}
