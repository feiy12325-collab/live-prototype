const axios = require('axios');

const API = 'http://localhost:3000';

async function run(){
  console.log('E2E Room Cover: starting');

  // fetch rooms
  const res = await axios.get(`${API}/api/rooms`);
  const rooms = res.data;

  // check all have cover
  for (const room of rooms) {
    if (!room.cover) throw new Error(`room ${room.id} has no cover`);
    console.log(`room ${room.id}: cover = ${room.cover.substring(0, 50)}...`);
  }

  // create new room and verify it has default cover
  const token = (await axios.post(`${API}/api/auth/login`, { username: 'covertest' })).data.token;
  const newRoom = { id: `cover-test-${Date.now()}`, name: 'Cover Test' };
  const cr = await axios.post(`${API}/api/rooms`, newRoom, { headers: { Authorization: `Bearer ${token}` } });
  if (!cr.data.cover) throw new Error('new room has no cover');
  console.log(`new room cover: ${cr.data.cover.substring(0, 50)}...`);

  // update cover
  const newCover = 'linear-gradient(90deg, red, blue)';
  const ur = await axios.patch(`${API}/api/rooms/${cr.data.id}/cover`, { cover: newCover }, { headers: { Authorization: `Bearer ${token}` } });
  if (ur.data.cover !== newCover) throw new Error('cover update failed');

  console.log('E2E Room Cover: SUCCESS');
  process.exit(0);
}

run().catch(err=>{ console.error(err); process.exit(1); });