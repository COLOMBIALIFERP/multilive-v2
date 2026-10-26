import { streamUrl } from './config.mjs';
import { appToken, getJSON } from './http.mjs';

const result = (platform, user, live, title = '', sessionId = '') => ({
  platform, user, live, title, sessionId: String(sessionId || ''), url: streamUrl(platform, user)
});

/** Twitch Helix API oficial. Una consulta por grupo de hasta seis usuarios. */
export async function checkTwitch(users, env = process.env, fetchImpl = fetch) {
  if (!users.length) return [];
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
    throw new Error('Faltan TWITCH_CLIENT_ID y TWITCH_CLIENT_SECRET');
  }
  const token = await appToken('https://id.twitch.tv/oauth2/token', env.TWITCH_CLIENT_ID, env.TWITCH_CLIENT_SECRET, 7000, fetchImpl);
  const u = new URL('https://api.twitch.tv/helix/streams');
  for (const user of users) u.searchParams.append('user_login', user);
  const data = await getJSON(u.toString(), {
    headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` }
  }, 7000, fetchImpl);
  if (!Array.isArray(data.data)) throw new Error('Respuesta Twitch sin data[]');
  const live = new Map(data.data.map(item => [String(item.user_login).toLowerCase(), item]));
  return users.map(user => {
    const item = live.get(user);
    return result('twitch', user, Boolean(item), item?.title || '', item?.id || '');
  });
}

/** Kick Public API oficial: por slug + token de aplicación. */
export async function checkKick(users, env = process.env, fetchImpl = fetch) {
  if (!users.length) return [];
  if (!env.KICK_CLIENT_ID || !env.KICK_CLIENT_SECRET) {
    throw new Error('Faltan KICK_CLIENT_ID y KICK_CLIENT_SECRET');
  }
  const token = await appToken('https://id.kick.com/oauth/token', env.KICK_CLIENT_ID, env.KICK_CLIENT_SECRET, 7000, fetchImpl);
  return await Promise.all(users.map(async user => {
    try {
      const u = new URL('https://api.kick.com/public/v1/channels');
      u.searchParams.set('slug', user);
      const data = await getJSON(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, 7000, fetchImpl);
      if (!Array.isArray(data.data)) throw new Error('Respuesta Kick sin data[]');
      const channel = data.data.find(c => String(c.slug).toLowerCase() === user);
      if (!channel) throw new Error(`Canal Kick no encontrado: ${user}`);
      if (typeof channel.stream?.is_live !== 'boolean') throw new Error(`Kick no devolvió is_live para ${user}`);
      return result('kick', user, channel.stream.is_live, channel.stream_title || '', channel.stream.start_time || '');
    } catch (error) {
      // Un canal erróneo no debe hacer fallar el resto de Kick.
      return { platform: 'kick', user, error: String(error.message || error) };
    }
  }));
}

/** TikTok: verificación puntual mediante biblioteca NO OFICIAL. */
export async function checkTikTok(users, _env = process.env, createClient) {
  if (!users.length) return [];
  const factory = createClient || (async (user, options) => {
    const { TikTokLiveConnection } = await import('tiktok-live-connector');
    return new TikTokLiveConnection(user, options);
  });
  return await Promise.all(users.map(async user => {
    try {
      // La versión 2.5.0 accede a options.processInitialData en el constructor.
      // Debe recibir un objeto de opciones aunque solo consultemos el estado LIVE.
      const connection = await factory(user, { processInitialData: false });
      // No se abre un WebSocket permanente: solo se consulta el estado actual.
      let timer;
      let live;
      try {
        live = await Promise.race([
          connection.fetchIsLive(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('TikTok excedió 12 segundos')), 12000);
          })
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (typeof live !== 'boolean') throw new Error('TikTok devolvió estado no booleano');
      return result('tiktok', user, live);
    } catch (error) {
      return { platform: 'tiktok', user, error: String(error.message || error) };
    }
  }));
}

/**
 * Estado de una cuenta Starvios a partir de discovery?kind=channel&username=...
 * No usar started_at como prueba de LIVE: puede permanecer en una emisión idle.
 * No interpretar títulos, playback_id o stream.id como prueba de directo.
 * La API observada es de la web de Starvios, no una API pública documentada.
 */
export function parseStarviosDiscovery(payload, user) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Starvios discovery no devolvió un objeto JSON');
  }
  const expected = String(user).replace(/^@/, '').toLowerCase();
  const channel = payload.channel;
  if (!channel || typeof channel.username !== 'string') {
    throw new Error(`Starvios discovery no devolvió channel.username para @${expected}`);
  }
  if (channel.username.toLowerCase() !== expected) {
    throw new Error(`Starvios discovery respondió para otro canal, no @${expected}`);
  }
  const stream = payload.stream;
  if (!stream || typeof stream !== 'object' || Array.isArray(stream)) {
    throw new Error(`Starvios discovery no devolvió stream.status para @${expected}`);
  }
  if (stream.channel_id && channel.id && stream.channel_id !== channel.id) {
    throw new Error(`Starvios discovery devolvió una transmisión de otro canal`);
  }
  if (stream.profiles?.username && String(stream.profiles.username).toLowerCase() !== expected) {
    throw new Error(`Starvios discovery devolvió datos de otro streamer`);
  }
  const status = String(stream.status ?? '').trim().toLowerCase();
  if (status === 'live') {
    if (!stream.id) throw new Error('Starvios indicó LIVE sin identificador de transmisión');
    return { live: true, title: String(stream.title || ''), sessionId: String(stream.id) };
  }
  if (['idle', 'offline', 'ended', 'stopped'].includes(status)) {
    return { live: false, title: '', sessionId: '' };
  }
  throw new Error(`Estado Starvios no reconocido: ${status ? status.slice(0, 36) : '(vacío)'}`);
}

/** La URL completa debe proceder de Request URL de la solicitud de discovery. */
export function buildStarviosDiscoveryUrl(base, user) {
  let url;
  try { url = new URL(String(base || '')); }
  catch { throw new Error('STARVIOS_DISCOVERY_URL debe ser la URL HTTPS completa de la solicitud discovery'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) {
    throw new Error('STARVIOS_DISCOVERY_URL requiere HTTPS y no admite credenciales ni fragmentos');
  }
  if (!/\/discovery\/?$/i.test(url.pathname)) {
    throw new Error('STARVIOS_DISCOVERY_URL debe terminar en /discovery');
  }
  for (const key of url.searchParams.keys()) {
    if (/token|auth|secret|session|api[-_]?key/i.test(key)) {
      throw new Error('No incluyas claves o tokens en la URL de Starvios');
    }
  }
  url.searchParams.set('kind', 'channel');
  url.searchParams.set('username', user);
  return url.toString();
}

/** Adaptador HTML antiguo: solo se usa si todavía no se configuró discovery. */
export function parseStarviosStatus(raw, user) {
  const html = String(raw ?? '');
  const normalized = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').toLowerCase();
  const handle = user.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`(?:@)?${handle}\\s+(?:no está en directo ahora|is not live right now|isn.t live right now)`, 'i').test(normalized)) return false;
  if (new RegExp(`(?:@)?${handle}\\s+(?:está en directo ahora|is live right now)`, 'i').test(normalized)) return true;
  return null; // desconocido, no generar alertas ni modificar estado.
}


/**
 * Starvios: detectar cualquier streamer mediante el endpoint público de discovery.
 * La URL base es común para todos; username se sustituye en cada petición.
 * STARVIOS_DISCOVERY_URL es opcional y permite actualizar la ruta si cambia.
 */
export const STARVIOS_DEFAULT_DISCOVERY_URL = 'https://starvios.com/api/public/discovery';
export async function checkStarvios(users, env = process.env, fetchImpl = fetch) {
  return await Promise.all(users.map(async user => {
    try {
      const url = buildStarviosDiscoveryUrl(env.STARVIOS_DISCOVERY_URL || STARVIOS_DEFAULT_DISCOVERY_URL, user);
      const headers = { Accept: 'application/json' };
      // Opcional y solo para acceso publico autorizado; nunca JWT o cookies de sesión.
      if (env.STARVIOS_PUBLIC_API_KEY) {
        const key = String(env.STARVIOS_PUBLIC_API_KEY);
        headers.apikey = key;
        if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
      }
      const data = await getJSON(url, { headers }, 7000, fetchImpl);
      const live = parseStarviosDiscovery(data, user);
      return result('starvios', user, live.live, live.title, live.sessionId);
    } catch (error) {
      return { platform: 'starvios', user, error: String(error.message || error) };
    }
  }));
}
