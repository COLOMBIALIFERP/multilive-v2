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
        const healthKey = `health/${platform}/${item.user}`;
        const health = { live: typeof item.live === 'boolean' ? item.live : null,
          checkedAt: now, url: item.url || '', title: item.title || '',
          providerStatus: item.providerStatus || null, action: null, error: item.error || null };
        try {
          if (item.error) {
            health.action = 'error';
            await store.setJSON(healthKey, health);
            // También registra fallos de /stream revisar, no solo los del cron.
            console.warn(`[MultiLIVE] Comprobación ${platform}/@${item.user} fallida: ${safeDiagnostic(item.error)}`);
            return { platform, user: item.user, action: 'error', reason: item.error };
          }
          if (!env.DISCORD_WEBHOOK_URL && item.live) {
            health.action = 'error';
            health.error = 'DISCORD_WEBHOOK_URL no configurado';
            await store.setJSON(healthKey, health);
            console.warn(`[MultiLIVE] ${platform}/@${item.user}: falta DISCORD_WEBHOOK_URL para enviar alerta`);
            return { platform, user: item.user, live: true, providerStatus: item.providerStatus,
              action: 'error', reason: health.error };
          }
          const r = await processPresence(store, item, alert => sendDiscord(env.DISCORD_WEBHOOK_URL, alert));
          health.action = r.action;
          if (r.action === 'sent') health.notifiedAt = new Date().toISOString();
          try { await store.setJSON(healthKey, health); }
          catch (writeError) {
            // El aviso ya puede haberse enviado. Un error del registro diagnóstico
            // NO debe presentarse como un fallo del webhook ni duplicar alertas.
            console.warn(`[MultiLIVE] No se pudo actualizar diagnóstico ${platform}/@${item.user}: ${safeDiagnostic(writeError.message || writeError)}`);
          }
          return { platform, user: item.user, live: item.live, providerStatus: item.providerStatus, ...r };
        } catch (error) {
          health.action = 'error';
          health.error = String(error.message || error);
          try { await store.setJSON(healthKey, health); }
          catch (writeError) {
            console.warn(`[MultiLIVE] No se pudo guardar diagnóstico ${platform}/@${item.user}: ${safeDiagnostic(writeError.message || writeError)}`);
          }
          console.warn(`[MultiLIVE] Comprobación ${platform}/@${item.user} fallida: ${safeDiagnostic(error.message || error)}`);
          return { platform, user: item.user, live: item.live === true, providerStatus: item.providerStatus,
            action: 'error', reason: String(error.message || error) };
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
