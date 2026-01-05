const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 模拟房间数据库
const rooms = new Map();

// 初始化示例房间
rooms.set('stream1', { id: 'stream1', name: '主播直播间', viewers: 42, status: 'live', created: new Date() });
rooms.set('stream2', { id: 'stream2', name: '教学直播', viewers: 18, status: 'live', created: new Date() });
rooms.set('stream3', { id: 'stream3', name: '游戏直播', viewers: 0, status: 'offline', created: new Date() });

// API: 获取所有房间
app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.values()).map(r => ({
    ...r,
    url: `http://localhost:8080/live/${r.id}.m3u8`
  }));
  res.json(roomList);
});

// API: 获取单个房间
app.get('/api/rooms/:id', (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ ...room, url: `http://localhost:8080/live/${room.id}.m3u8` });
});

// API: 创建房间
app.post('/api/rooms', (req, res) => {
  const { id, name } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name required' });
  if (rooms.has(id)) return res.status(409).json({ error: 'Room already exists' });
  const room = { id, name, viewers: 0, status: 'offline', created: new Date() };
  rooms.set(id, room);
  res.json(room);
});

// API: 更新房间观众数
app.patch('/api/rooms/:id', (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const { viewers, status } = req.body;
  if (viewers !== undefined) room.viewers = viewers;
  if (status !== undefined) room.status = status;
  res.json(room);
});

app.get('/status', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Web server listening on ${port}`));
