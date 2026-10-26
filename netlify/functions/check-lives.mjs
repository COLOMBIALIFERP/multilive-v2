import { getStore } from '@netlify/blobs';
import { performChecks } from '../../lib/runner.mjs';
import { STORE_NAME } from '../../lib/watchlist.mjs';

/**
 * Comprueba las cuentas automáticamente cada minuto (configurado en netlify.toml).
 * La función y /stream revisar comparten el mismo performChecks: no depende de que
 * un usuario ejecute un comando para enviar una alerta.
 */
export default async function handler(event = {}) {
  const startedAt = new Date();
  console.log(`[MultiLIVE] check-lives START ${startedAt.toISOString()}`);
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });

  try {
    const results = await performChecks(store);
    for (const r of results) {
      const live = r.live === true ? 'LIVE' : r.live === false ? 'OFFLINE' : 'UNKNOWN';
      const message = `[MultiLIVE] ${r.platform}/@${r.user}: ${live}; acción=${r.action}${r.reason ? `; motivo=${String(r.reason).slice(0, 220)}` : ''}`;
      if (r.action === 'error') console.warn(message);
      else console.log(message);
    }
    const sent = results.filter(x => x.action === 'sent').length;
    const live = results.filter(x => x.live === true).length;
    const errors = results.filter(x => x.action === 'error').length;
    console.log(`[MultiLIVE] check-lives END revisados=${results.length} live=${live} avisos_enviados=${sent} errores=${errors} duracion_ms=${Date.now() - startedAt.getTime()}`);
  } catch (error) {
    console.error('[MultiLIVE] Fallo general al comprobar canales:', error?.stack || error?.message || String(error));
  }
}
