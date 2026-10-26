import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { addWatched, listWatched, removeWatched, normalizeHandle, MAX_USERS_PER_PLATFORM } from '../lib/watchlist.mjs';
import { runStreamCommand, STREAM_COMMAND, verifyDiscordSignature, secureEqual } from '../lib/discord-commands.mjs';

function store() {
  const memory = new Map();
  return {
    async get(key, {type} = {}) { const val = memory.get(key); return val === undefined ? null : type==='json'?JSON.parse(val):val; },
    async setJSON(key, val, options={}) { if (options.onlyIfNew && memory.has(key)) return {modified:false}; memory.set(key, JSON.stringify(val)); return {modified:true}; },
    async list({prefix=''}) { return {blobs:[...memory.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}; },
    async delete(key) { memory.delete(key); },
    async set(key, value, options={}) { if (options.onlyIfNew && memory.has(key)) return {modified:false}; memory.set(key, value); return {modified:true}; }
  };
}
const interaction = (subcommand, params = {}, permissions = '8', guild_id = '999') => ({
  type: 2, guild_id, member: { permissions, user: {id: '123'} },
  data: { name: 'stream', options: [{ name:subcommand, type:1, options:Object.entries(params).map(([name,value])=>({name,value})) }] }
});
const env = { DISCORD_GUILD_ID: '999' };

test('acepta usuario simple, @handle y enlace de su plataforma, rechaza web externa', () => {
  assert.equal(normalizeHandle('tiktok', '@djcr0ss'), 'djcr0ss');
  assert.equal(normalizeHandle('tiktok', 'https://www.tiktok.com/@djcr0ss/live'), 'djcr0ss');
  assert.equal(normalizeHandle('kick', 'https://kick.com/diCross'), 'dicross');
  assert.throws(()=>normalizeHandle('kick','https://otro-sitio.com/u'), /no pertenece/);
  assert.throws(()=>normalizeHandle('kick','bad username'), /no válido/);
});

test('cuentas persisten en blobs separadas, sin duplicados y se pueden eliminar', async () => {
  const s = store();
  assert.equal((await addWatched(s, 'tiktok', '@Uno')).action, 'added');
  assert.equal((await addWatched(s, 'tiktok', 'UNO')).action, 'exists');
  assert.equal((await addWatched(s, 'kick', 'UNO')).action, 'added');
  assert.deepEqual(await listWatched(s), { twitch:[],kick:['uno'],tiktok:['uno'],starvios:[]});
  assert.equal((await removeWatched(s, 'tiktok', 'uno')).action, 'removed');
  assert.equal((await removeWatched(s, 'tiktok', 'uno')).action, 'absent');
  assert.deepEqual((await listWatched(s)).kick, ['uno']);
});

test('respeta límite 6 cuentas por plataforma', async () => {
  const s = store();
  for(let x=0;x<MAX_USERS_PER_PLATFORM;x++) await addWatched(s,'twitch',`user${x}`);
  await assert.rejects(()=>addWatched(s,'twitch','extra'), /Máximo/);
});

test('solo admins pueden agregar o eliminar, guild distinta no autorizada', async () => {
  const s = store();
  const p = {plataforma:'twitch',usuario:'djcr0ss'};
  assert.match(await runStreamCommand(interaction('agregar',p,'0'),s,env), /Solo los administradores/);
  assert.match(await runStreamCommand(interaction('agregar',p,'8','other'),s,env), /no está autorizado/);
  assert.match(await runStreamCommand(interaction('agregar',p),s,env), /agregado/);
  assert.match(await runStreamCommand(interaction('lista',{},'0'),s,env), /djcr0ss/);
  assert.match(await runStreamCommand(interaction('eliminar',p),s,env), /eliminado/);
});

test('directos muestra último estado; revisar produce resultado y usa comprobador inyectado', async () => {
  const s = store();
  await addWatched(s,'tiktok','djcr0ss');
  const result = await runStreamCommand(interaction('revisar'),s,env,async(_store)=>[
    { platform:'tiktok',user:'djcr0ss',live:true, action:'sent' }
  ]);
  assert.match(result,/1 en directo/);
  await s.setJSON('health/tiktok/djcr0ss', {live:true,checkedAt:new Date().toISOString()});
  assert.match(await runStreamCommand(interaction('directos'),s,env), /tiktok\.com/);
});

test('revisar muestra diagnóstico legible cuando TikTok no confirma estado', async () => {
  const s = store();
  await addWatched(s,'tiktok','djcr0ss_');
  const message = await runStreamCommand(interaction('revisar'),s,env,async () => [
    {platform:'tiktok', user:'djcr0ss_', action:'error', reason:'HTTP 403' }
  ]);
  assert.match(message, /1 errores/);
  assert.match(message, /TikTok\/@djcr0ss_.*HTTP 403/);
});

test('comando de guild contiene cinco subcomandos', () => {
  assert.deepEqual(STREAM_COMMAND.options.map(o => o.name), ['agregar','eliminar','lista','directos','revisar']);
  assert.equal(STREAM_COMMAND.name,'stream');
});

test('verifica criptográficamente firma Discord y rechaza manipulación y expiración', () => {
  const {privateKey, publicKey} = generateKeyPairSync('ed25519');
  const rawPub = publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex');
  const timestamp='1792780800'; // fecha arbitraria fija.
  const body=JSON.stringify({type:1});
  const sig=sign(null, Buffer.from(timestamp + body),privateKey).toString('hex');
  const now=Number(timestamp)*1000;
  assert.equal(verifyDiscordSignature(rawPub,timestamp,sig,body,now),true);
  assert.equal(verifyDiscordSignature(rawPub,timestamp,sig,body+'x',now),false);
  assert.equal(verifyDiscordSignature(rawPub,timestamp,sig,body,now + 3600000),false);
  assert.equal(secureEqual('abcdef','abcdef'), true);
  assert.equal(secureEqual('abcdef','abcdeg'), false);
});


test('Starvios: un miembro común puede registrar un streamer; Twitch/Kick/TikTok requieren administrador', async () => {
  const s = store();
  assert.match(await runStreamCommand(interaction('agregar', {plataforma:'starvios',usuario:'horuswrld'},'0'),s,env), /agregado/);
  assert.deepEqual((await listWatched(s)).starvios, ['horuswrld']);
  for (const plataforma of ['twitch','kick','tiktok']) {
    assert.match(await runStreamCommand(interaction('agregar',{plataforma, usuario:'prueba'}, '0'),s,env), /administradores/);
  }
  assert.match(await runStreamCommand(interaction('revisar', {}, '0'),s,env), /administradores/);
});

test('Starvios: miembro no puede eliminar canal agregado por otro, pero administrador sí', async () => {
  const s=store();
  await addWatched(s, 'starvios','cr0ss', '99999');
  const p={plataforma:'starvios', usuario:'cr0ss'};
  assert.match(await runStreamCommand(interaction('eliminar',p,'0'),s,env), /Solo puedes eliminar/);
  assert.deepEqual((await listWatched(s)).starvios, ['cr0ss']);
  assert.match(await runStreamCommand(interaction('eliminar',p,'8'),s,env), /eliminado/);
});

test('Starvios: miembro puede eliminar cuenta propia y tiene máximo dos registros', async () => {
  const s=store();
  for (const usuario of ['canaluno','canaldos']) {
    assert.match(await runStreamCommand(interaction('agregar',{plataforma:'starvios',usuario},'0'),s,env), /agregado/);
  }
  assert.match(await runStreamCommand(interaction('agregar',{plataforma:'starvios',usuario:'canaltres'},'0'),s,env), /hasta 2/);
  assert.match(await runStreamCommand(interaction('eliminar',{plataforma:'starvios',usuario:'canaluno'},'0'),s,env), /eliminado/);
  assert.match(await runStreamCommand(interaction('agregar',{plataforma:'starvios',usuario:'canaltres'},'0'),s,env), /agregado/);
});
