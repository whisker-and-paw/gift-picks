import { put } from '@vercel/blob';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '仅支持 POST' });

  const b = req.body || {};
  if (!b.selfType || !/^[EISNTFJP]{4}$/.test(b.selfType))
    return res.status(400).json({ error: '无效的 MBTI 类型' });

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];

  const room = {
    selfType: b.selfType,
    selfAnswers: b.selfAnswers || null,
    status: 'created',
    otherAnswers: null,
    createdAt: Date.now(),
  };

  try {
    await put(`rooms/${code}.json`, JSON.stringify(room), { access: 'private', addRandomSuffix: false, allowOverwrite: true });
    return res.json({ code });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: '创建失败: ' + e.message });
  }
}
