const axios = require('axios');
const { createClient } = require('redis');

const API = 'http://localhost:3000';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function run(){
  console.log('E2E Moderation Actions Test: starting');

  const adminRes = await axios.post(`${API}/api/auth/login`, { username: 'admin' });
  const adminToken = adminRes.data.token;

  // normal user sends bad message
  const userRes = await axios.post(`${API}/api/auth/login`, { username: 'to_ban' });
  const userToken = userRes.data.token;

  // send message via socket in-process: use API to emulate saved flag
  // we'll directly flag a message to simulate real-time detection
  const flagged = { sender: 'to_ban', text: 'please remove badword', ts: Date.now() };
  const r = createClient({ url: REDIS_URL });
  await r.connect();
  await r.rPush('mod:stream1', JSON.stringify(flagged));

  // ensure it's there
  const q = await r.lRange('mod:stream1', -10, -1);
  console.log('mod before', q);

  // fetch queue as admin
  const qRes = await axios.get(`${API}/api/moderation/queue?room=stream1`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const item = qRes.data.queue.find(x=>x.entry && x.entry.sender==='to_ban');
  if (!item) throw new Error('flagged item not found');

  // approve it
  await axios.post(`${API}/api/moderation/action`, { roomId: 'stream1', raw: item.raw, action: 'approve' }, { headers: { Authorization: `Bearer ${adminToken}` } });
  const chat = await r.lRange('chat:stream1', -10, -1);
  const chatHas = chat.some(s=>s.includes('please remove badword'));
  if (!chatHas) throw new Error('approve failed');

  // now flag another and ban the user
  const flagged2 = { sender: 'to_ban', text: 'another badword', ts: Date.now() };
  await r.rPush('mod:stream1', JSON.stringify(flagged2));
  const q2 = await r.lRange('mod:stream1', -10, -1);
  const item2 = q2.map((s, idx)=>({ idx, raw: s })).find(x=>x.raw.includes('another badword'));
  if (!item2) throw new Error('item2 not found');

  await axios.post(`${API}/api/moderation/action`, { roomId: 'stream1', raw: item2.raw, action: 'ban', username: 'to_ban' }, { headers: { Authorization: `Bearer ${adminToken}` } });

  // verify banned set
  const banned = await r.sMembers('moderation:banned_users');
  if (!banned.includes('to_ban')) throw new Error('ban failed');

  await r.quit();
  console.log('E2E Moderation Actions Test: SUCCESS');
  process.exit(0);
}

run().catch(err=>{ console.error(err); process.exit(1); });