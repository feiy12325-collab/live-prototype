const axios = require('axios');
const { createClient } = require('redis');

const API = 'http://localhost:3000';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function run(){
  console.log('Prefs E2E: starting');
  const username = `tester`;

  // ensure clean state
  const rcli = createClient({ url: REDIS_URL });
  await rcli.connect();
  await rcli.del(`user:${username}:prefs`);

  // login
  const res = await axios.post(`${API}/api/auth/login`, { username });
  const token = res.data.token;
  console.log('login token received');

  // fetch me
  const me = await axios.get(`${API}/api/users/me`, { headers: { Authorization: `Bearer ${token}` } });
  console.log('me:', me.data);

  // set prefs
  const prefs = { lang: 'en' };
  const pRes = await axios.patch(`${API}/api/users/me`, { prefs }, { headers: { Authorization: `Bearer ${token}` } });
  if (!pRes.data || !pRes.data.prefs) throw new Error('PATCH /api/users/me failed');
  console.log('prefs saved to server');

  // allow async persistence
  await sleep(200);

  // check Redis
  const raw = await rcli.get(`user:${username}:prefs`);
  if (!raw) throw new Error('prefs not found in redis');
  const parsed = JSON.parse(raw);
  console.log('redis prefs:', parsed);
  if (parsed.lang !== 'en') throw new Error('prefs mismatch');

  // fetch me again
  const me2 = await axios.get(`${API}/api/users/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!me2.data || !me2.data.prefs || me2.data.prefs.lang !== 'en') throw new Error('fetch after save mismatch');

  await rcli.quit();
  console.log('Prefs E2E: SUCCESS');
  process.exit(0);
}

run().catch(err=>{ console.error(err); process.exit(1); });
