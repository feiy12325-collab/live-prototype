const axios = require('axios');

const API = 'http://localhost:3000';

async function run(){
  console.log('E2E Create Room: starting');
  const username = 'creator';

  // login
  const r = await axios.post(`${API}/api/auth/login`, { username });
  const token = r.data.token;

  const newRoom = { id: `room-${Date.now()}`, name: '自动创建房间' };
  await axios.post(`${API}/api/rooms`, newRoom, { headers: { Authorization: `Bearer ${token}` } });

  // verify
  const check = await axios.get(`${API}/api/rooms/${newRoom.id}`);
  if (check.data && check.data.id === newRoom.id) {
    console.log('E2E Create Room: SUCCESS');
    process.exit(0);
  } else {
    console.error('E2E Create Room: FAILED');
    process.exit(1);
  }
}

run().catch(err=>{ console.error(err); process.exit(2); });