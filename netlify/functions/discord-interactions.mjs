import { getStore } from '@netlify/blobs';
import { verifyDiscordSignature, deferredEphemeral, runStreamCommand, editOriginalInteraction } from '../../lib/discord-commands.mjs';
import { STORE_NAME } from '../../lib/watchlist.mjs';

/** Endpoint para la URL de Interactions en Discord Developer Portal. */
export default async function handler(request, context) {
  if (request.method !== 'POST') return new Response('Solo POST', { status: 405 });
  const publicKey = process.env.DISCORD_PUBLIC_KEY || '';
  const signature = request.headers.get('x-signature-ed25519') || '';
  const timestamp = request.headers.get('x-signature-timestamp') || '';
  const raw = await request.text();
  if (!verifyDiscordSignature(publicKey, timestamp, signature, raw)) return new Response('Firma inválida', { status: 401 });
  let interaction;
  try { interaction = JSON.parse(raw); } catch { return new Response('JSON no válido', { status: 400 }); }
  if (interaction.type === 1) return Response.json({ type: 1 }); // Discord PING.
  if (interaction.type !== 2 || interaction.data?.name !== 'stream') {
    return Response.json({ type: 4, data: { content: 'Comando desconocido', flags: 64 } });
  }
  if (!process.env.DISCORD_APPLICATION_ID) {
    return Response.json({ type: 4, data: { content: 'Falta configurar DISCORD_APPLICATION_ID', flags: 64 } });
  }
  // Una discord-app mal configurada no debe modificar la lista ni causar
  // respuestas 404: el ID del payload debe coincidir con la aplicación propia.
  if (interaction.application_id &&
      String(interaction.application_id) !== String(process.env.DISCORD_APPLICATION_ID)) {
    console.error('DISCORD_APPLICATION_ID no coincide con application_id de la interacción.');
    return Response.json({ type: 4, data: {
      content: 'El Application ID configurado en Netlify no coincide con la aplicación que envió este comando.',
      flags: 64
    } });
  }
  const job = async () => {
    let message;
    try {
      const store = getStore({ name: STORE_NAME, consistency: 'strong' });
      message = await runStreamCommand(interaction, store);
    } catch (error) {
      console.error('Error ejecutando comando Discord:', error.message);
      message = '⚠️ No se pudo ejecutar el comando. Consulta los registros de Netlify.';
    }
    // Un fallo al editar el mensaje no implica que se haya perdido la operación
    // en Blobs. No volver a ejecutar el comando ni reemplazar su respuesta.
    try {
      await editOriginalInteraction(process.env.DISCORD_APPLICATION_ID, interaction.token, message);
    } catch (error) {
      console.error('Error publicando la respuesta en Discord:', error.message);
    }
  };
  // Discord exige responder en <= 3 segundos. Netlify continúa la tarea tras el ACK.
  if (typeof context?.waitUntil === 'function') {
    context.waitUntil(job());
    return deferredEphemeral();
  }
  return Response.json({type: 4, data: {content: 'Entorno sin soporte de ejecución diferida; actualiza la función de Netlify.', flags: 64}});
}
