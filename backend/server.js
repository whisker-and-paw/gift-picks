import express from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const ROOMS_FILE = join(DATA_DIR, 'rooms.json');
const PORT = parseInt(process.env.PORT || '3000');

// 确保数据目录存在
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// 内存数据 + 文件持久化
let rooms = {};
if (existsSync(ROOMS_FILE)) {
  try { rooms = JSON.parse(readFileSync(ROOMS_FILE, 'utf-8')); } catch(e) { rooms = {}; }
}

function saveRooms() {
  writeFileSync(ROOMS_FILE, JSON.stringify(rooms));
}

// 7 天过期清理
function cleanExpired() {
  const now = Date.now();
  const expired = Object.keys(rooms).filter(k => now - rooms[k].createdAt > 604800000);
  expired.forEach(k => delete rooms[k]);
  if (expired.length) saveRooms();
}
setInterval(cleanExpired, 3600000);

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = ''; for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)]; }
  while (rooms[code]);
  return code;
}

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// POST /api/create-room
app.post('/api/create-room', (req, res) => {
  const { selfType, selfAnswers } = req.body || {};
  if (!selfType || !/^[EISNTFJP]{4}$/.test(selfType))
    return res.status(400).json({ error: '无效的 MBTI 类型' });

  const code = genCode();
  rooms[code] = {
    selfType,
    selfAnswers: selfAnswers || null,
    status: 'created',
    otherAnswers: null,
    createdAt: Date.now(),
  };
  saveRooms();
  res.json({ code });
});

// GET /api/room/:code
app.get('/api/room/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const room = rooms[code];
  if (!room) return res.status(404).json({ error: '房间不存在', errorCode: 'ROOM_NOT_FOUND' });
  res.json(room);
});

// POST /api/room/:code/submit-other
app.post('/api/room/:code/submit-other', (req, res) => {
  const code = req.params.code.toUpperCase();
  const room = rooms[code];
  if (!room) return res.status(404).json({ error: '房间不存在', errorCode: 'ROOM_NOT_FOUND' });
  if (room.status !== 'created') return res.status(409).json({ error: '已提交过', errorCode: 'ALREADY_DONE' });

  const { answers } = req.body || {};
  if (!Array.isArray(answers) || answers.length === 0)
    return res.status(400).json({ error: '请完成所有题目' });

  room.otherAnswers = answers;
  room.status = 'completed';
  saveRooms();
  res.json({ success: true });
});

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, rooms: Object.keys(rooms).length });
});

app.listen(PORT, () => {
  console.log(`🚀 API running on port ${PORT}`);
});
