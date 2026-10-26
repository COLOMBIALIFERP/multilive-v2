import { createHash } from 'node:crypto';

/**
 * Estado duradero en Netlify Blobs; "onlyIfNew" impide duplicados al solaparse
 * dos invocaciones. No cambia el estado si una consulta a la plataforma falló.
 * Las sesiones sin ID se identifican por el último paso comprobado a offline.
 */
export async function processPresence(store, item, send, now = () => new Date().toISOString()) {
  if (item.error) return { action: 'error', reason: item.error };
  if (typeof item.live !== 'boolean') return { action: 'error', reason: 'estado no confirmado' };
  const stateKey = `status/${item.platform}/${item.user}`;
  const prev = await store.get(stateKey, { type: 'json', consistency: 'strong' });
  if (!item.live) {
    if (prev?.live === false) return { action: 'offline-unchanged' };
    await store.setJSON(stateKey, { live: false, offlineSince: now(), sessionKey: null });
    return { action: 'offline' };
  }

  const sessionKey = item.sessionId ? `id:${item.sessionId}` : `since-offline:${prev?.offlineSince ?? 'initial'}`;
  // Compatibilidad con el estado guardado por versiones anteriores de Starvios:
  // antes se guardaba stream.id como `id:...`. Si el detector actualizado ya no
  // confía en ese ID, permitir una única migración/alerta para no dejar la sesión
  // actual silenciada; la siguiente comprobación usará la nueva clave estable.
  const legacyStarviosSession = item.platform === 'starvios' && !item.sessionId
    && String(prev?.sessionKey || '').startsWith('id:');
  if (prev?.live && (prev.sessionKey === sessionKey || (!item.sessionId && !legacyStarviosSession))) {
    return { action: 'already-announced' };
  }
  const hash = createHash('sha256').update(`${item.platform}:${item.user}:${sessionKey}`).digest('hex');
  const claimKey = `announced/${hash}`;
  const claim = await store.set(claimKey, now(), { onlyIfNew: true });
  if (claim.modified) {
    try {
      await send(item);
    } catch (error) {
      // Al fallar Discord, deshacer la marca para volver a intentar.
      await store.delete(claimKey);
      throw error;
    }
  }
  await store.setJSON(stateKey, { live: true, sessionKey, notifiedAt: now() });
  return { action: claim.modified ? 'sent' : 'duplicate-skipped' };
}
