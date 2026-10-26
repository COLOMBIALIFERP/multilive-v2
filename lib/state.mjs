import { createHash } from 'node:crypto';

/**
 * Guarda presencia duradera en Netlify Blobs y envía una sola alerta por sesión.
 * La sesión queda delimitada por el último período confirmado offline incluso
 * si una plataforma reutiliza el mismo ID en transmisiones distintas. Esto se
 * aplica a todas las plataformas, no solo a Starvios.
 * Un error/desconocido nunca cambia el estado y un fallo de Discord permite reintentar.
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

  // Delimita el ID de la sesión por el último offline confirmado. Si la
  // plataforma reutiliza streamId en otra transmisión, la clave cambia.
  const offlineEpoch = prev?.live === false ? (prev.offlineSince || 'initial')
    : (prev?.offlineSince || 'initial');
  const sessionKey = item.sessionId
    ? `id:${item.sessionId}:epoch:${offlineEpoch}`
    : `since-offline:${offlineEpoch}`;

  // Si una versión previa guardó ID de sesión y ahora el adaptador ya no puede
  // proporcionar uno, permite una única migración/alerta para no dejar la sesión
  // actual silenciada. Tras eso, la clave genérica evita duplicados normales.
  const previousSessionKey = String(prev?.sessionKey || '');
  const legacySessionWithoutId = prev?.live && !item.sessionId
    && previousSessionKey.startsWith('id:');
  // Migra la clave de versiones anteriores sin volver a avisar de una emisión
  // que ya estaba marcada como LIVE y conserva el mismo ID de sesión.
  if (prev?.live && item.sessionId && previousSessionKey === `id:${item.sessionId}`) {
    await store.setJSON(stateKey, {
      live: true, sessionKey, offlineSince: prev?.offlineSince || null,
      notifiedAt: prev?.notifiedAt || now()
    });
    return { action: 'already-announced' };
  }
  if (prev?.live && prev.sessionKey === sessionKey) {
    return { action: 'already-announced' };
  }
  if (prev?.live && !item.sessionId && !legacySessionWithoutId) {
    return { action: 'already-announced' };
  }

  const hash = createHash('sha256')
    .update(`${item.platform}:${item.user}:${sessionKey}`)
    .digest('hex');
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
  await store.setJSON(stateKey, {
    live: true,
    sessionKey,
    offlineSince: prev?.live === false ? (prev.offlineSince || null) : (prev?.offlineSince || null),
    notifiedAt: now()
  });
  return { action: claim.modified ? 'sent' : 'duplicate-skipped' };
}
