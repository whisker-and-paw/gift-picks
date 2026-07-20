import { get } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: '仅支持 GET' });

  const code = (req.query.code || '').toUpperCase();
  if (!code) return res.status(400).json({ error: '缺少密令' });

  try {
    const result = await get(`rooms/${code}.json`, { access: 'private' });
    if (!result) return res.status(404).json({ error: '房间不存在', errorCode: 'ROOM_NOT_FOUND' });
    const text = await new Response(result.stream).text();
    return res.json(JSON.parse(text));
  } catch (e) {
    if (e.message?.includes('not found') || e.message?.includes('404'))
      return res.status(404).json({ error: '房间不存在', errorCode: 'ROOM_NOT_FOUND' });
    console.error(e);
    return res.status(500).json({ error: '查询失败: ' + e.message });
  }
}
