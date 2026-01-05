const axios = require('axios');
const io = require('socket.io-client');
const { createClient } = require('redis');

const API = 'http://localhost:3000';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function login(username) {
  const r = await axios.post(`${API}/api/auth/login`, { username });
  return r.data.token;
}

async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function run(){
  console.log('E2E Chat Test: starting');
  const aliceTok = await login('alice');
  const bobTok = await login('bob');
  console.log('Got tokens for alice and bob');

  const alice = io(API, { auth: { token: aliceTok }, transports: ['websocket'] });
  const bob = io(API, { auth: { token: bobTok }, transports: ['websocket'] });

  alice.on('connect', () => { console.log('alice connected'); alice.emit('join','stream1'); });
  bob.on('connect', () => { console.log('bob connected'); bob.emit('join','stream1'); });

  let aliceOk=false, bobOk=false;
  alice.on('chat', (m)=>{ console.log('alice recv chat', m); if(m.sender==='bob') bobOk=true; });
  bob.on('chat', (m)=>{ console.log('bob recv chat', m); if(m.sender==='alice') aliceOk=true; });

  // wait for connections
  await sleep(500);
  alice.emit('message', { roomId: 'stream1', text: 'hello from alice' });
  await sleep(200);
  bob.emit('message', { roomId: 'stream1', text: 'hello from bob' });

  // wait messages to be delivered and persisted
  await sleep(800);

  // check Redis
  const r = createClient({ url: REDIS_URL });
  await r.connect();
  const list = await r.lRange('chat:stream1', -10, -1);
  await r.quit();

  console.log('Redis entries:', list.map(s=>JSON.parse(s)));

  alice.disconnect(); bob.disconnect();

  const parsed = list.map(s=>JSON.parse(s));
  const hasAlice = parsed.some(m=>m.sender==='alice' && m.text.includes('alice'));
  const hasBob = parsed.some(m=>m.sender==='bob' && m.text.includes('bob'));

  if (hasAlice && hasBob && aliceOk && bobOk) {
    console.log('E2E Chat Test: SUCCESS');
    process.exit(0);
  } else {
    console.error('E2E Chat Test: FAILED');
    process.exit(1);
  }
}

run().catch(err=>{ console.error(err); process.exit(2); });
