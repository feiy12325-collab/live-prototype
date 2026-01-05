const axios = require('axios');
const io = require('socket.io-client');
const { createClient } = require('redis');

const API = 'http://localhost:3000';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function run(){
  console.log('E2E Moderation Test: starting');
  const username = `modtester`;
  const token = (await axios.post(`${API}/api/auth/login`, { username })).data.token;

  const socket = io(API, { auth: { token }, transports: ['websocket'] });

  let gotModeration = false;
  socket.on('connect', () => { console.log('socket connected'); socket.emit('join','stream1'); });
  socket.on('moderation', (m) => { console.log('moderation event', m); gotModeration = true; });

  await sleep(400);

  socket.emit('message', { roomId: 'stream1', text: 'this contains badword which should be blocked' });

  await sleep(800);

  // verify Redis: message should NOT be in chat list, but present in mod list
  const r = createClient({ url: REDIS_URL });
  await r.connect();
  const chat = await r.lRange('chat:stream1', -10, -1);
  const mod = await r.lRange('mod:stream1', -10, -1);
  await r.quit();

  const chatHasBad = chat.some(s=>s.includes('badword'));
  const modHasBad = mod.some(s=>s.includes('badword'));

  socket.disconnect();

  console.log('chatHasBad', chatHasBad, 'modHasBad', modHasBad, 'gotModeration', gotModeration);

  if (!chatHasBad && modHasBad && gotModeration) {
    console.log('E2E Moderation Test: SUCCESS');
    process.exit(0);
  } else {
    console.error('E2E Moderation Test: FAILED');
    process.exit(1);
  }
}

run().catch(err=>{ console.error(err); process.exit(2); });