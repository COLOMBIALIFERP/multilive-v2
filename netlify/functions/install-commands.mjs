import { secureEqual, STREAM_COMMAND } from '../../lib/discord-commands.mjs';

/** Instalador protegido, solo una vez tras configurar aplicación; no deja token en frontend. */
export default async function handler(request) {
  if (request.method !== 'POST') return new Response('Solo POST', { status: 405 });
  const expected = process.env.TEST_SECRET || '';
  const received = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (expected.length < 20 || !secureEqual(received, expected)) return new Response('No autorizado', { status: 401 });
  const env = process.env;
  for (const key of ['DISCORD_BOT_TOKEN', 'DISCORD_APPLICATION_ID', 'DISCORD_PUBLIC_KEY', 'DISCORD_GUILD_ID']) {
    if (!env[key]) return Response.json({ok:false, error:`Falta ${key} en Netlify`}, {status:400});
  }
  for (const id of [env.DISCORD_APPLICATION_ID, env.DISCORD_GUILD_ID]) {
    if (!/^\d{16,22}$/.test(id)) return Response.json({ok:false,error:'Application/Guild ID no válido'}, {status:400});
  }
  const endpoint = `https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`;
  try {
    const result = await fetch(endpoint, { method: 'POST', headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json'
    }, body: JSON.stringify(STREAM_COMMAND) });
    if (!result.ok) {
      console.error(`Error instalando comandos: Discord HTTP ${result.status}`);
      return Response.json({ok:false,error:`Discord respondió HTTP ${result.status}. Comprueba que la aplicación esté instalada en tu servidor y el token sea válido.`},{status:502});
    }
    return Response.json({ok:true,message:'Comando /stream instalado en tu servidor. Prueba /stream lista en Discord.'});
  } catch (e) {
    console.error('Error de red al registrar comandos:',e.message);
    return Response.json({ok:false,error:'No se pudo contactar la API de Discord'}, {status:502});
  }
}
