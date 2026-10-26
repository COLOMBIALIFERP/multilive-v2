import { createPublicKey, verify as cryptoVerify, timingSafeEqual } from 'node:crypto';
import { PLATFORMS, streamUrl } from './config.mjs';
import { addWatched, listWatched, removeWatched, normalizeHandle, watchKey, countOwnedStarvios, MAX_STARVIOS_PER_MEMBER } from './watchlist.mjs';
import { performChecks, readDirects } from './runner.mjs';
import { safeDiagnostic } from './diagnostics.mjs';

const PLATFORM_CHOICES = Object.entries(PLATFORMS).map(([value, info]) => ({ name: info.label, value }));
const platformOption = { type: 3, name: 'plataforma', description: 'Plataforma de streaming', required: true, choices: PLATFORM_CHOICES };
const userOption = { type: 3, name: 'usuario', description: 'Usuario (@nombre) o enlace de su canal', required: true, min_length: 1, max_length: 200 };

export const STREAM_COMMAND = {
  name: 'stream',
  description: 'Gestionar avisos LIVE de Twitch, Kick, TikTok y Starvios',
  type: 1,
  // Comando de servidor (guild command), no se expone en DMs.
  options: [
    { type: 1, name: 'agregar', description: 'Agregar Starvios (todos); otras plataformas (admins)', options: [platformOption, userOption] },
    { type: 1, name: 'eliminar', description: 'Eliminar Starvios propio; admins pueden eliminar cualquiera', options: [platformOption, userOption] },
    { type: 1, name: 'lista', description: 'Mostrar las cuentas vigiladas' },
    { type: 1, name: 'directos', description: 'Mostrar los últimos directos detectados' },
    { type: 1, name: 'revisar', description: 'Comprobar ahora las cuentas (solo administradores)' }
  ]
};

export function verifyDiscordSignature(publicKey, timestamp, signature, body, nowMs = Date.now()) {
  if (!/^[a-f0-9]{64}$/i.test(publicKey || '') || !/^[a-f0-9]{128}$/i.test(signature || '')) return false;
  if (!/^\d{10,13}$/.test(timestamp || '')) return false;
  // Protección contra reenvío de una interacción antigua.
  const stamp = Number(timestamp) * 1000;
  if (!Number.isFinite(stamp) || Math.abs(stamp - nowMs) > 5 * 60 * 1000) return false;
  try {
    const prefix = Buffer.from('302a300506032b6570032100', 'hex'); // SubjectPublicKeyInfo para Ed25519.
    const key = createPublicKey({ key: Buffer.concat([prefix, Buffer.from(publicKey, 'hex')]), type: 'spki', format: 'der' });
    return cryptoVerify(null, Buffer.from(timestamp + body, 'utf8'), key, Buffer.from(signature, 'hex'));
  } catch { return false; }
}

export const deferredEphemeral = () => Response.json({ type: 5, data: { flags: 64 } });

function isAdmin(member) {
  try { return (BigInt(member?.permissions || '0') & 8n) !== 0n; } catch { return false; }
}
function formatList(entries) {
  const lines = Object.entries(entries).map(([platform, users]) =>
    `**${PLATFORMS[platform].label} (${users.length}):** ${users.length ? users.map(u => `\`@${u}\``).join(', ') : 'ninguna cuenta'}`);
  return `**Cuentas vigiladas**\n${lines.join('\n')}\n\nLas revisiones automáticas se ejecutan cada 10 minutos.`;
}
function formatDirects(current) {
  if (!current.checked.length) return 'Todavía no hay cuentas. Usa `/stream agregar` para registrar una.';
  const live = current.live.filter(({status}) =>
    new Date(status.checkedAt).getTime() >= Date.now() - 30 * 60 * 1000
  );
  const title = live.length ? `🔴 **Últimos directos detectados (${live.length}):**` : 'Por ahora no hay directos recientes confirmados.';
  const lines = live.map(({platform,user,status}) => {
    const sec = Math.floor(new Date(status.checkedAt).getTime() / 1000);
    return `• **${PLATFORMS[platform].label}** — [@${user}](${streamUrl(platform,user)}) · visto <t:${sec}:R>`;
  });
  const unknown = current.checked.filter(x => !x.status || x.status.live === null).length;
  const note = unknown ? `\n⚠️ ${unknown} cuenta(s) sin estado fiable (sin revisar o error de plataforma).` : '';
  return `${title}${lines.length ? `\n${lines.join('\n')}` : ''}${note}\n_Resultado de la última comprobación; no es una conexión en tiempo real._`;
}
function formatReview(results) {
  if (!results.length) return 'No tienes cuentas registradas. Usa `/stream agregar`.';
  const online = results.filter(x => x.live === true && x.action !== 'error');
  const errors = results.filter(x => x.action === 'error');
  const details = errors.slice(0, 5).map(x =>
    `• ${PLATFORMS[x.platform]?.label || x.platform}/@${x.user}: ${safeDiagnostic(x.reason)}`
  );
  return `✅ **Comprobación terminada:** ${results.length} canales revisados, ${online.length} en directo, ${errors.length} errores.` +
    (online.length ? `\n🔴 ${online.map(x => `${PLATFORMS[x.platform].label} @${x.user}`).join(' · ')}` : '') +
    (errors.length ? `\n⚠️ No se pudo confirmar el estado de estas cuentas:\n${details.join('\n')}` +
      (errors.length > details.length ? `\n... y ${errors.length - details.length} más (consulta Netlify).` : '') : '') +
    '\nUsa `/stream directos` para ver los enlaces y el momento de la última comprobación.';
}

export async function runStreamCommand(interaction, store, env = process.env, checkImpl = performChecks) {
  if (!env.DISCORD_GUILD_ID || !interaction.guild_id || String(interaction.guild_id) !== String(env.DISCORD_GUILD_ID)) {
    return 'Este bot no está autorizado para utilizarse en este servidor.';
  }
  const opts = interaction.data?.options || [];
  const action = opts[0]?.name;
  if (!['agregar', 'eliminar', 'lista', 'directos', 'revisar'].includes(action)) return 'Subcomando no reconocido.';
  const admin = isAdmin(interaction.member);
  const discordUserId = String(interaction.member?.user?.id || '');
  if (action === 'revisar' && !admin) {
    return '⛔ Solo los administradores del servidor pueden iniciar revisiones manuales.';
  }
  if (action === 'lista') return formatList(await listWatched(store));
  if (action === 'directos') return formatDirects(await readDirects(store));
  if (action === 'revisar') {
    // Límite simple a comprobaciones manuales: 90 s por servidor.
    const last = await store.get('admin/manual-review-last', { type: 'json', consistency: 'strong' });
    if (last?.at && Date.now() - new Date(last.at).getTime() < 90_000) {
      return '⏳ Acabas de solicitar una revisión. Puedes repetirla después de 90 segundos.';
    }
    await store.setJSON('admin/manual-review-last', { at: new Date().toISOString() });
    return formatReview(await checkImpl(store, env));
  }
  const input = Object.fromEntries((opts[0]?.options || []).map(o => [o.name, o.value]));
  if (!input.plataforma || !input.usuario) return 'Indica `plataforma` y `usuario`.';
  // Starvios es autogestionado por cualquier miembro de este servidor.
  // Las otras plataformas y /stream revisar mantienen permiso Administrator.
  if (!admin && input.plataforma !== 'starvios') {
    return '⛔ Solo los administradores pueden modificar Twitch, Kick y TikTok. Starvios está disponible para todos.';
  }
  if (!admin && !discordUserId) {
    return '⛔ No fue posible identificar tu usuario de Discord.';
  }
  try {
    const normalizedUser = normalizeHandle(input.plataforma, input.usuario);
    if (action === 'agregar') {
      if (!admin) {
        const entries = await listWatched(store);
        if (!entries.starvios.includes(normalizedUser) &&
            await countOwnedStarvios(store, discordUserId) >= MAX_STARVIOS_PER_MEMBER) {
          return `⛔ Puedes registrar hasta ${MAX_STARVIOS_PER_MEMBER} canales de Starvios. Elimina uno de los tuyos para agregar otro.`;
        }
      }
      const r = await addWatched(store, input.plataforma, normalizedUser, discordUserId);
      return r.action === 'exists'
        ? `ℹ️ **@${r.user}** ya está registrado en ${PLATFORMS[r.platform].label}.`
        : `✅ **@${r.user}** agregado en **${PLATFORMS[r.platform].label}**. Se comprobará automáticamente cada 10 minutos.${admin ? ' Usa `/stream revisar` para comprobarlo ahora.' : ' Las alertas aparecerán en el canal configurado del servidor.'}`;
    }
    // Un miembro sin privilegios no puede borrar las cuentas de otros usuarios.
    if (!admin) {
      const entry = await store.get(watchKey('starvios', normalizedUser), { type: 'json', consistency: 'strong' });
      if (entry && String(entry.addedBy || '') !== discordUserId) {
        return '⛔ Solo puedes eliminar los canales Starvios que agregaste. Solicita ayuda a un administrador.';
      }
    }
    const r = await removeWatched(store, input.plataforma, normalizedUser);
    return r.action === 'absent'
      ? `ℹ️ **@${r.user}** no estaba registrado en ${PLATFORMS[r.platform].label}.`
      : `🗑️ **@${r.user}** eliminado de ${PLATFORMS[r.platform].label}.`;
  } catch (error) { return `⚠️ ${String(error.message || error)}`; }
}

/**
 * Discord puede tardar unos segundos en registrar el ACK HTTP (type 5).
 * Un PATCH muy temprano a @original puede devolver 404 aunque el comando
 * se haya ejecutado. Reintenta únicamente los 404, nunca repite el comando.
 */
const discordRetryDelays = [400, 800, 1600, 2800, 4000];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function editOriginalInteraction(appId, token, content, fetchImpl = fetch, sleepImpl = sleep) {
  const url = `https://discord.com/api/v10/webhooks/${encodeURIComponent(appId)}/${encodeURIComponent(token)}/messages/@original`;
  const body = JSON.stringify({ content: String(content || '').slice(0, 1950), allowed_mentions: { parse: [] } });
  for (let attempt = 0; attempt <= discordRetryDelays.length; attempt++) {
    if (attempt > 0) await sleepImpl(discordRetryDelays[attempt - 1]);
    const response = await fetchImpl(url, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body
    });
    if (response.ok) return;
    let code;
    try {
      const detail = await response.json();
      if (typeof detail?.code === 'number') code = detail.code;
    } catch { /* Discord también puede devolver texto o cuerpo vacío. */ }
    if (response.status === 404 && attempt < discordRetryDelays.length) continue;
    throw new Error(`Discord edit original: HTTP ${response.status}${code ? ` (código ${code})` : ''}` +
      (attempt ? ` tras ${attempt + 1} intentos` : ''));
  }
}

export function secureEqual(a, b) {
  const aa = Buffer.from(String(a || '')); const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
