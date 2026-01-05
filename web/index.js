const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// 模拟房间数据库
const rooms = new Map();

// 默认封面生成（使用占位符图片）
function generateDefaultCover(roomId) {
  // 基于房间 ID 生成伪随机数作为图片编号
  const hash = roomId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const photoId = (hash % 100) + 1; // picsum.photos ID 1-100
  return `https://picsum.photos/400/225?random=${photoId}`;
}

// 初始化示例房间
rooms.set('stream1', { id: 'stream1', name: '主播直播间', viewers: 42, status: 'live', created: new Date(), cover: generateDefaultCover('stream1') });
rooms.set('stream2', { id: 'stream2', name: '教学直播', viewers: 18, status: 'live', created: new Date(), cover: generateDefaultCover('stream2') });
rooms.set('stream3', { id: 'stream3', name: '游戏直播', viewers: 0, status: 'offline', created: new Date(), cover: generateDefaultCover('stream3') });

// Authentication helpers
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function authRequired(req, res, next) {
  const auth = req.headers.authorization && req.headers.authorization.split(' ')[1];
  if (!auth) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(auth, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// User prefs helpers (stored in Redis per-user)
async function getUserPrefs(username) {
  try {
    const c = createClient({ url: REDIS_URL });
    await c.connect();
    const raw = await c.get(`user:${username}:prefs`);
    await c.quit();
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('Failed to get user prefs', err);
    return {};
  }
}

async function setUserPrefs(username, prefs) {
  try {
    const c = createClient({ url: REDIS_URL });
    await c.connect();
    await c.set(`user:${username}:prefs`, JSON.stringify(prefs || {}));
    await c.quit();
    return true;
  } catch (err) {
    console.error('Failed to set user prefs', err);
    return false;
  }
}

// API: 登录（演示用，不做密码校验）
app.post('/api/auth/login', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });
  const role = username === 'admin' ? 'admin' : 'user';
  const token = signToken({ username, role });
  const prefs = await getUserPrefs(username);
  res.json({ token, username, role, prefs });
});

// API: 当前用户信息与偏好
app.get('/api/users/me', authRequired, async (req, res) => {
  const username = req.user && req.user.username;
  if (!username) return res.status(400).json({ error: 'invalid token' });
  const prefs = await getUserPrefs(username);
  res.json({ username, role: req.user.role, prefs });
});

// API: 更新当前用户偏好（示例：{ prefs: { lang: 'zh' } } ）
app.patch('/api/users/me', authRequired, async (req, res) => {
  const username = req.user && req.user.username;
  if (!username) return res.status(400).json({ error: 'invalid token' });
  const { prefs } = req.body;
  if (!prefs) return res.status(400).json({ error: 'prefs required' });
  const ok = await setUserPrefs(username, prefs);
  if (!ok) return res.status(500).json({ error: 'failed to save prefs' });
  res.json({ prefs });
});

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

// API: 获取房间聊天历史（最近 N 条）
app.get('/api/rooms/:id/messages', async (req, res) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit || '50', 10);
  try {
    const key = `chat:${id}`;
    const arr = await (async () => {
      const c = createClient({ url: REDIS_URL });
      await c.connect();
      const raw = await c.lRange(key, -limit, -1);
      await c.quit();
      return raw.map(s => JSON.parse(s));
    })();
    res.json(arr);
  } catch (err) {
    console.error('Failed to fetch messages', err);
    res.status(500).json({ error: 'internal' });
  }
});

// API: 创建房间 (需要登录)
app.post('/api/rooms', authRequired, (req, res) => {
  const { id, name } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name required' });
  if (rooms.has(id)) return res.status(409).json({ error: 'Room already exists' });
  const room = { id, name, viewers: 0, status: 'offline', created: new Date(), owner: req.user.username, cover: generateDefaultCover(id) };
  rooms.set(id, room);
  res.json(room);
});

// API: 更新房间观众数 / 状态 (需要登录且为 owner or admin)
app.patch('/api/rooms/:id', authRequired, (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.owner && req.user.username !== room.owner && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { viewers, status } = req.body;
  if (viewers !== undefined) room.viewers = viewers;
  if (status !== undefined) room.status = status;
  res.json(room);
});

app.get('/status', (req, res) => res.json({ ok: true }));

// Create HTTP server and Socket.IO with Redis adapter
const server = http.createServer(app);
const io = new Server(server);

(async () => {
  try {
    const pubClient = createClient({ url: REDIS_URL });
    await pubClient.connect();
    const subClient = pubClient.duplicate();
    await subClient.connect();
    io.adapter(createAdapter(pubClient, subClient));

    // Separate redis client for chat persistence
    const redisClient = createClient({ url: REDIS_URL });
    await redisClient.connect();

    // helper: persist chat message and trim
    async function saveMessage(roomId, msg) {
      const key = `chat:${roomId}`;
      try {
        await redisClient.rPush(key, JSON.stringify(msg));
        // keep last 200 messages
        await redisClient.lTrim(key, -200, -1);
      } catch (err) {
        console.error('Failed to save message', err);
      }
    }

    async function loadMessages(roomId, limit = 50) {
      const key = `chat:${roomId}`;
      try {
        const arr = await redisClient.lRange(key, -limit, -1);
        return arr.map(s => JSON.parse(s));
      } catch (err) {
        console.error('Failed to load messages', err);
        return [];
      }
    }

    // Moderation helpers
    async function getModerationList() {
      try {
        const c = createClient({ url: REDIS_URL });
        await c.connect();
        const raw = await c.get('moderation:banned');
        await c.quit();
        return raw ? JSON.parse(raw) : ['badword', 'spamword'];
      } catch (err) {
        console.error('Failed to get moderation list', err);
        return ['badword', 'spamword'];
      }
    }

    async function setModerationList(list) {
      try {
        const c = createClient({ url: REDIS_URL });
        await c.connect();
        await c.set('moderation:banned', JSON.stringify(list || []));
        await c.quit();
        return true;
      } catch (err) {
        console.error('Failed to set moderation list', err);
        return false;
      }
    }

    function containsBannedText(text, bannedList) {
      if (!text) return false;
      const lowered = String(text).toLowerCase();
      for (const b of bannedList) {
        if (!b) continue;
        const pattern = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${pattern}\\b`, 'i');
        if (re.test(lowered)) return true;
      }
      return false;
    }

    async function flagMessage(roomId, payload, reason = 'banned') {
      const key = `mod:${roomId}`;
      try {
        await redisClient.rPush(key, JSON.stringify({ ...payload, reason }));
        // keep last 500 flagged entries
        await redisClient.lTrim(key, -500, -1);
      } catch (err) {
        console.error('Failed to flag message', err);
      }
    }

    // ban / unban users
    async function banUser(username) {
      try {
        await redisClient.sAdd('moderation:banned_users', username);
        return true;
      } catch (err) { console.error('banUser failed', err); return false; }
    }

    async function unbanUser(username) {
      try {
        await redisClient.sRem('moderation:banned_users', username);
        return true;
      } catch (err) { console.error('unbanUser failed', err); return false; }
    }

    async function isUserBanned(username) {
      try {
        return await redisClient.sIsMember('moderation:banned_users', username);
      } catch (err) { console.error('isUserBanned failed', err); return false; }
    }

    // middleware: if token is provided, verify and attach user to socket
    io.use((socket, next) => {
      const token = socket.handshake && socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(); // allow anonymous viewers but no send
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        socket.user = payload;
      } catch (e) {
        // invalid token - ignore and allow anonymous
      }
      next();
    });

    io.on('connection', (socket) => {
      // simple rate limit per socket
      socket._lastMsgAt = 0;

      socket.on('join', async (roomId) => {
        const roomKey = `room:${roomId}`;
        socket.join(roomKey);

        // increase viewer count locally and broadcast
        const r = rooms.get(roomId);
        if (r) { r.viewers = (r.viewers || 0) + 1; }
        io.to(roomKey).emit('viewer', { roomId, viewers: r ? r.viewers : 0 });

        // send recent chat history to this client
        const recent = await loadMessages(roomId, 100);
        socket.emit('chatHistory', recent);

        // send moderation stats (counts of flagged messages) for room (optional)
        try {
          const cnt = await redisClient.lLen(`mod:${roomId}`);
          socket.emit('moderationStats', { roomId, flagged: cnt });
        } catch (e) { /* ignore */ }
      });

      socket.on('leave', (roomId) => {
        const roomKey = `room:${roomId}`;
        socket.leave(roomKey);
        const r = rooms.get(roomId);
        if (r && r.viewers > 0) { r.viewers -= 1; }
        io.to(roomKey).emit('viewer', { roomId, viewers: r ? r.viewers : 0 });
      });

      socket.on('message', async (data) => {
        // require authenticated user to send messages
        if (!socket.user || !socket.user.username) {
          socket.emit('error', { type: 'auth', message: 'Authentication required' });
          return;
        }

        const { roomId, text } = data || {};
        if (!roomId || !text) return;

        // rate limit: 500ms
        const now = Date.now();
        if (now - (socket._lastMsgAt || 0) < 500) return;
        socket._lastMsgAt = now;

        // sanitize length
        const clean = String(text).trim().slice(0, 1000);
        const sender = socket.user.username;
        const payload = { sender, text: clean, ts: Date.now() };

        // check if sender is banned
        if (await isUserBanned(sender)) {
          socket.emit('error', { type: 'banned', message: 'You are banned from sending messages' });
          return;
        }

        // moderation check
        const banned = await getModerationList();
        if (containsBannedText(clean, banned)) {
          // flag and notify the sender, do not broadcast or persist to public chat
          await flagMessage(roomId, payload, 'banned');
          socket.emit('moderation', { roomId, reason: 'banned' });
          return;
        }

        // persist
        await saveMessage(roomId, payload);

        // broadcast
        io.to(`room:${roomId}`).emit('chat', payload);
      });

      socket.on('disconnect', () => { /* nothing */ });
    });

    const port = process.env.PORT || 3000;
    server.listen(port, () => console.log(`Web server listening on ${port}`));
  // moderation endpoints (admin)
  app.get('/api/moderation', authRequired, async (req, res) => {
    try {
      const list = await getModerationList();
      res.json({ banned: list });
    } catch (err) { res.status(500).json({ error: 'internal' }); }
  });

  app.patch('/api/moderation', authRequired, async (req, res) => {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
    const { banned } = req.body;
    if (!Array.isArray(banned)) return res.status(400).json({ error: 'banned must be array' });
    const ok = await setModerationList(banned);
    if (!ok) return res.status(500).json({ error: 'internal' });
    res.json({ banned });
  });

  // moderation queue: list flagged messages for a room
  app.get('/api/moderation/queue', authRequired, async (req, res) => {
    const roomId = req.query.room;
    if (!roomId) return res.status(400).json({ error: 'room required' });
    try {
      const arr = await redisClient.lRange(`mod:${roomId}`, 0, -1);
      const parsed = arr.map((s, idx) => ({ id: idx, raw: s, entry: JSON.parse(s) }));
      res.json({ queue: parsed });
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal' }); }
  });

  // moderation action (approve/delete/ban/replace)
  app.post('/api/moderation/action', authRequired, async (req, res) => {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
    const { roomId, raw, action, replaceText, username } = req.body;
    if (!roomId || !raw || !action) return res.status(400).json({ error: 'roomId, raw and action required' });

    try {
      const key = `mod:${roomId}`;
      // remove the exact raw entry
      const removed = await redisClient.lRem(key, 1, raw);
      if (!removed) return res.status(404).json({ error: 'entry not found' });

      if (action === 'approve') {
        // push original entry to chat
        const entry = JSON.parse(raw);
        await redisClient.rPush(`chat:${roomId}`, JSON.stringify({ sender: entry.sender, text: entry.text, ts: Date.now() }));
        await redisClient.lTrim(`chat:${roomId}`, -200, -1);
        return res.json({ ok: true });
      }

      if (action === 'delete') {
        return res.json({ ok: true });
      }

      if (action === 'ban') {
        if (!username) return res.status(400).json({ error: 'username required for ban' });
        await banUser(username);
        return res.json({ ok: true });
      }

      if (action === 'replace') {
        if (typeof replaceText !== 'string') return res.status(400).json({ error: 'replaceText required' });
        const entry = JSON.parse(raw);
        const replaced = { sender: entry.sender, text: replaceText, ts: Date.now(), moderated: true };
        await redisClient.rPush(`chat:${roomId}`, JSON.stringify(replaced));
        await redisClient.lTrim(`chat:${roomId}`, -200, -1);
        return res.json({ ok: true });
      }

      return res.status(400).json({ error: 'unknown action' });
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal' }); }
  });

  // Room cover API: update cover
  app.patch('/api/rooms/:id/cover', authRequired, (req, res) => {
    const room = rooms.get(req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.owner && req.user.username !== room.owner && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { cover } = req.body;
    if (!cover) return res.status(400).json({ error: 'cover required' });
    room.cover = cover;
    res.json({ cover });
  });

  } catch (err) {
    console.error('Failed to start Redis adapter or Socket.IO', err);
    process.exit(1);
  }
})();
