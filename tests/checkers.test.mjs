import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTwitch, checkKick, checkTikTok, checkStarvios, parseStarviosStatus, parseStarviosDiscovery, buildStarviosDiscoveryUrl } from '../lib/checkers.mjs';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('Twitch usa token de aplicación y detecta directo vs sin directo', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(String(url));
    if (String(url).includes('oauth2/token')) return json({ access_token: 'prueba' });
    assert.equal(options.headers.Authorization, 'Bearer prueba');
    return json({ data: [{ user_login: 'uno', id: 'stream123', title: 'Vamos!', type: 'live' }] });
  };
  const r = await checkTwitch(['uno', 'dos'], { TWITCH_CLIENT_ID: 'cid', TWITCH_CLIENT_SECRET: 'secret' }, fetchImpl);
  assert.deepEqual(r.map(x => x.live), [true, false]);
  assert.equal(r[0].sessionId, 'stream123');
  assert.equal(calls.length, 2);
});

test('Kick usa API oficial y no interpreta error de un canal como offline', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('id.kick.com')) return json({ access_token: 'token' });
    if (String(url).includes('slug=existe')) return json({ data: [{ slug: 'existe', stream_title: 'En vivo', stream: { is_live: true, start_time: '2026-10-23T11:22:00Z' } }] });
    return json({ data: [] });
  };
  const r = await checkKick(['existe', 'inexistente'], { KICK_CLIENT_ID: 'id', KICK_CLIENT_SECRET: 'sec' }, fetchImpl);
  assert.equal(r[0].live, true);
  assert.equal(r[0].sessionId, '2026-10-23T11:22:00Z');
  assert.equal(r[1].live, undefined);
  assert.match(r[1].error, /no encontrado/);
});

test('TikTok aislado: no abre websocket, detecta booleano', async () => {
  const r = await checkTikTok(['streamer'], {}, async () => ({ fetchIsLive: async () => true }));
  assert.equal(r[0].live, true);
  assert.equal(r[0].url, 'https://www.tiktok.com/@streamer/live');
});


test('TikTok: pasa opciones explícitas a tiktok-live-connector 2.5.0', async () => {
  const constructorCalls = [];
  const r = await checkTikTok(['streamer'], {}, async (user, options) => {
    constructorCalls.push({ user, options });
    if (!options || typeof options.processInitialData !== 'boolean') {
      throw new TypeError("Cannot read properties of undefined (reading 'processInitialData')");
    }
    return { fetchIsLive: async () => false };
  });
  assert.equal(r[0].live, false);
  assert.deepEqual(constructorCalls, [{ user: 'streamer', options: { processInitialData: false } }]);
});

test('TikTok: un error externo se informa como desconocido, nunca como offline', async () => {
  const r = await checkTikTok(['streamer'], {}, async () => ({ fetchIsLive: async () => {
    throw new Error('TikTok HTTP 403');
  } }));
  assert.equal(r[0].live, undefined);
  assert.match(r[0].error, /HTTP 403/);
});

test('Starvios: solo estados explícitos, no confunde título antiguo con LIVE', async () => {
  assert.equal(parseStarviosStatus('<h1>mario no está en directo ahora</h1><p>🔴 LIVE ayer</p>', 'mario'), false);
  assert.equal(parseStarviosStatus('<h1>mario está en directo ahora</h1>', 'mario'), true);
  assert.equal(parseStarviosStatus('<h1>Último directo: 🔴 LIVE</h1>', 'mario'), null);
  // El detector principal ya no consulta el HTML; usa el endpoint JSON observado.
});


test('Starvios discovery: idle NO es live aunque tenga started_at y playback_id', () => {
  const data = {
    channel: { id: 'canal-cr0ss', username: 'cr0ss' },
    stream: { id: 'emision-antigua', channel_id: 'canal-cr0ss',
      profiles: { username: 'cr0ss' }, status: 'idle',
      title: 'Programando servidor', started_at: '2026-10-26T13:04:34.473+00:00',
      playback_id: 'playback-antiguo' }
  };
  assert.deepEqual(parseStarviosDiscovery(data, 'cr0ss'), { live: false, title: '', sessionId: '' });
});

test('Starvios discovery: estado live usa título pero no confía en stream.id como ID de sesión', async () => {
  const response = { channel: { id: 'canal1', username: 'cr0ss' },
    stream: { id: 'live-nueva-emision', channel_id: 'canal1', status: 'live',
      title: '¡EN DIRECTO!', profiles: { username: 'cr0ss' } } };
  const env = { STARVIOS_DISCOVERY_URL: 'https://public.example.org/functions/v1/discovery?kind=channel&username=OTRO' };
  const r = await checkStarvios(['cr0ss'], env, async (url, options) => {
    const u = new URL(url);
    assert.equal(u.searchParams.get('username'), 'cr0ss');
    assert.equal(u.searchParams.get('kind'), 'channel');
    assert.equal(options.headers.Accept, 'application/json');
    return json(response);
  });
  assert.equal(r[0].live, true);
  assert.equal(r[0].sessionId, '');
  assert.equal(r[0].title, '¡EN DIRECTO!');
  assert.equal(r[0].url, 'https://starvios.com/live/cr0ss');
});

test('Starvios discovery: usernames parecidos son distintos, nunca alerta cruzada', async () => {
  const data = { channel: { id:'canal-otro', username:'crosss' },
    stream: { id: 'live-otro', channel_id:'canal-otro', status:'live' } };
  assert.throws(() => parseStarviosDiscovery(data, 'cr0ss'), /otro canal/);
  const r = await checkStarvios(['cr0ss'], { STARVIOS_DISCOVERY_URL:'https://public.example.org/functions/v1/discovery' },
    async () => json(data));
  assert.equal(r[0].live, undefined);
  assert.match(r[0].error, /otro canal/);
});

test('Starvios discovery: estado desconocido, stream ausente, HTTP 401 son errores, NO offline', async () => {
  const data = { channel: { id:'c', username:'cr0ss' }, stream: { id:'i', channel_id:'c', status:'starting' } };
  assert.throws(() => parseStarviosDiscovery(data, 'cr0ss'), /no reconocido/);
  assert.throws(() => parseStarviosDiscovery({ channel: { username:'cr0ss' }, stream:null }, 'cr0ss'), /stream.status/);
  const r = await checkStarvios(['cr0ss'], { STARVIOS_DISCOVERY_URL:'https://public.example.org/functions/v1/discovery' },
    async () => json({ message:'unauthorized' }, 401));
  assert.equal(r[0].live, undefined);
  assert.match(r[0].error, /HTTP 401/);
});

test('Starvios: valida HTTPS y rechaza credenciales en URL', () => {
  assert.throws(() => buildStarviosDiscoveryUrl('http://public.example.org/discovery','cr0ss'), /HTTPS/);
  assert.throws(() => buildStarviosDiscoveryUrl('https://public.example.org/discovery?access_token=123','cr0ss'), /tokens/);
  assert.throws(() => buildStarviosDiscoveryUrl('https://public.example.org/other','cr0ss'), /discovery/);
  assert.equal(buildStarviosDiscoveryUrl('https://public.example.org/discovery?kind=channel&username=x','cr0ss'),
    'https://public.example.org/discovery?kind=channel&username=cr0ss');
});

test('Starvios: usa apikey público opcional sin transmitir claves en URL', async () => {
  const env={ STARVIOS_DISCOVERY_URL:'https://public.example.org/functions/v1/discovery', STARVIOS_PUBLIC_API_KEY:'sb_publishable_publictest' };
  const r=await checkStarvios(['cr0ss'],env,async (url,opts)=>{
    assert.equal(new URL(url).searchParams.has('apikey'),false);
    assert.equal(opts.headers.apikey,'sb_publishable_publictest');
    assert.equal(opts.headers.Authorization,undefined);
    return json({channel:{username:'cr0ss'},stream:{status:'idle'}});
  });
  assert.equal(r[0].live,false);
});


test('Starvios: endpoint público predeterminado y usuario dinámico para CUALQUIER canal', async () => {
  const requests = [];
  const r = await checkStarvios(['cr0ss','horuswrld','arisa'], {}, async (url) => {
    const u = new URL(url);
    assert.equal(u.origin, 'https://starvios.com');
    assert.equal(u.pathname, '/api/public/discovery');
    assert.equal(u.searchParams.get('kind'), 'channel');
    const user = u.searchParams.get('username');
    requests.push(user);
    return json({ channel: {id:user, username:user}, stream: {id:`live-${user}`,status:user==='horuswrld'?'live':'idle',channel_id:user} });
  });
  assert.deepEqual(requests, ['cr0ss','horuswrld','arisa']);
  assert.deepEqual(r.map(x=>x.live), [false,true,false]);
  assert.equal(r[1].sessionId, '');
});
