/** Misma comprobación para cron y comando /stream revisar. */
import { checkKick, checkTwitch, checkTikTok, checkStarvios } from './checkers.mjs';
import { processPresence } from './state.mjs';
import { sendDiscord } from './notify.mjs';
import { listWatched } from './watchlist.mjs';
import { safeDiagnostic } from './diagnostics.mjs';

const checkers = { twitch: checkTwitch, kick: checkKick, tiktok: checkTikTok, starvios: checkStarvios };

export async function performChecks(store, env = process.env, overrides = {}) {
  const channels = await listWatched(store);
  const tasks = Object.entries(channels)
    .filter(([, users]) => users.length)
    .map(async ([platform, users]) => {
      let checked;
      try {
        checked = await (overrides[platform] || checkers[platform])(users, env);
      } catch (error) {
        checked = users.map(user => ({ platform, user, error: String(error.message || error) }));
      }
      return await Promise.all(checked.map(async item => {
        const now = new Date().toISOString();
        const health = { live: typeof item.live === 'boolean' ? item.live : null,
          checkedAt: now, url: item.url || '', title: item.title || '',
          error: item.error || null };
        try {
          await store.setJSON(`health/${platform}/${item.user}`, health);
          if (item.error) {
            // También registra fallos de /stream revisar, no solo los del cron.
            console.warn(`[MultiLIVE] Comprobación ${platform}/@${item.user} fallida: ${safeDiagnostic(item.error)}`);
            return { platform, user: item.user, action: 'error', reason: item.error };
          }
          if (!env.DISCORD_WEBHOOK_URL && item.live) {
            console.warn(`[MultiLIVE] ${platform}/@${item.user}: falta DISCORD_WEBHOOK_URL para enviar alerta`);
            return { platform, user: item.user, action: 'error', reason: 'DISCORD_WEBHOOK_URL no configurado' };
          }
          const r = await processPresence(store, item, alert => sendDiscord(env.DISCORD_WEBHOOK_URL, alert));
          return { platform, user: item.user, live: item.live, ...r };
        } catch (error) {
          console.warn(`[MultiLIVE] Comprobación ${platform}/@${item.user} fallida: ${safeDiagnostic(error.message || error)}`);
          return { platform, user: item.user, action: 'error', reason: String(error.message || error) };
        }
      }));
    });
  return (await Promise.all(tasks)).flat();
}

export async function readDirects(store) {
  const channels = await listWatched(store);
  const checked = await Promise.all(Object.entries(channels).flatMap(([platform, users]) =>
    users.map(async user => ({
      platform, user, status: await store.get(`health/${platform}/${user}`, { type: 'json', consistency: 'strong' })
    }))
  ));
  return { channels, checked, live: checked.filter(x => x.status?.live === true) };
}
