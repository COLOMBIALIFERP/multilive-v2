import { getStore } from '@netlify/blobs';
import { performChecks } from '../../lib/runner.mjs';
import { STORE_NAME } from '../../lib/watchlist.mjs';

/** Programada cada 10 minutos: ahora lee los usuarios registrados desde Discord. */
export default async function handler() {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });
  try {
    const results = await performChecks(store);
    for (const r of results) {
      const message = `[${r.platform}] @${r.user}: ${r.action}${r.reason ? ` (${r.reason})` : ''}`;
      if (r.action === 'error') console.warn(message); else console.log(message);
    }
    console.log(`Comprobados: ${results.length}. Avisos: ${results.filter(x => x.action === 'sent').length}.`);
  } catch (error) {
    console.error('Fallo general al comprobar canales:', error.message);
  }
}
