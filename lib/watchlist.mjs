/** Cuentas administradas desde comandos Discord. Persisten en Netlify Blobs. */
import { PLATFORMS } from './config.mjs';

export const MAX_USERS_PER_PLATFORM = 6; // Máximo total por plataforma en un servidor.
export const MAX_STARVIOS_PER_MEMBER = 2; // Evita que un miembro ocupe todos los espacios.
export const STORE_NAME = 'multilive-discord';
const WATCH_PREFIX = 'watch/';

/** Acepta @usuario o URL de la plataforma; rechaza URLs externas. */
export function normalizeHandle(platform, raw) {
  if (!Object.hasOwn(PLATFORMS, platform)) throw new Error('Plataforma no válida');
  let input = String(raw || '').trim();
  if (/^https?:\/\//i.test(input)) {
    let url;
    try { url = new URL(input); } catch { throw new Error('URL no válida'); }
    const domains = {
      twitch: ['twitch.tv', 'www.twitch.tv'],
      kick: ['kick.com', 'www.kick.com'],
      tiktok: ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'],
      starvios: ['starvios.com', 'www.starvios.com']
    };
    if (!domains[platform].includes(url.hostname.toLowerCase())) {
      throw new Error('La URL no pertenece a la plataforma indicada');
    }
    const parts = url.pathname.split('/').filter(Boolean);
    input = platform === 'starvios' && parts[0]?.toLowerCase() === 'live'
      ? parts[1] : parts[0];
  }
  const handle = String(input || '').replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_.-]{1,32}$/.test(handle)) {
    throw new Error('Usuario no válido. Escribe el nombre sin espacios (máximo 32 caracteres)');
  }
  return handle;
}

export function watchKey(platform, handle) {
  return `${WATCH_PREFIX}${platform}/${handle}`;
}

export async function listWatched(store) {
  const { blobs } = await store.list({ prefix: WATCH_PREFIX });
  const result = { twitch: [], kick: [], tiktok: [], starvios: [] };
  for (const { key } of blobs) {
    const matched = /^watch\/(twitch|kick|tiktok|starvios)\/([a-z0-9_.-]{1,32})$/.exec(key);
    if (matched) result[matched[1]].push(matched[2]);
  }
  for (const users of Object.values(result)) users.sort();
  return result;
}

export async function addWatched(store, platform, raw, addedBy = '') {
  const user = normalizeHandle(platform, raw);
  const entries = await listWatched(store);
  if (entries[platform].includes(user)) return { action: 'exists', platform, user };
  if (entries[platform].length >= MAX_USERS_PER_PLATFORM) {
    throw new Error(`Máximo ${MAX_USERS_PER_PLATFORM} cuentas de ${PLATFORMS[platform].label} en esta versión`);
  }
  const result = await store.setJSON(watchKey(platform, user), {
    platform, user, addedAt: new Date().toISOString(), addedBy: String(addedBy)
  }, { onlyIfNew: true });
  return { action: result.modified ? 'added' : 'exists', platform, user };
}

/** Número de canales Starvios agregados por un usuario de Discord, en este servidor. */
export async function countOwnedStarvios(store, discordUserId) {
  if (!discordUserId) return 0;
  const { blobs } = await store.list({ prefix: 'watch/starvios/' });
  let count = 0;
  for (const { key } of blobs) {
    const entry = await store.get(key, { type: 'json', consistency: 'strong' });
    if (entry && String(entry.addedBy || '') === String(discordUserId)) count++;
  }
  return count;
}

export async function removeWatched(store, platform, raw) {
  const user = normalizeHandle(platform, raw);
  const key = watchKey(platform, user);
  const exists = await store.get(key);
  if (exists === null) return { action: 'absent', platform, user };
  await store.delete(key);
  await store.delete(`health/${platform}/${user}`);
  await store.delete(`status/${platform}/${user}`);
  return { action: 'removed', platform, user };
}
