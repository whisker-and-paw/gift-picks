/**
 * 人格镜像 · 双人 MBTI 对比测试
 *
 * KV Namespace 绑定: GIFT_ROOMS
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const rateLimitMap = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60000;
  const maxRequests = 20;
  const timestamps = rateLimitMap.get(ip) || [];
  const recent = timestamps.filter(t => now - t < windowMs);
  if (recent.length >= maxRequests) return false;
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return true;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      // POST /api/create-room
      if (url.pathname === '/api/create-room' && request.method === 'POST') {
        if (!checkRateLimit(clientIp)) {
          return jsonResponse({ error: '请求太频繁，请稍后再试' }, 429);
        }
        const body = await request.json().catch(() => null);
        if (!body || !body.selfType) {
          return jsonResponse({ error: '缺少自我 MBTI 类型' }, 400);
        }
        if (!/^[EISNTFJP]{4}$/.test(body.selfType)) {
          return jsonResponse({ error: '无效的 MBTI 类型' }, 400);
        }
        const code = generateCode();
        const roomData = {
          selfType: body.selfType,
          selfAnswers: body.selfAnswers || null,
          status: 'created',
          otherAnswers: null,
          createdAt: Date.now(),
        };
        await env.GIFT_ROOMS.put(code, JSON.stringify(roomData), { expirationTtl: 604800 });
        return jsonResponse({ code });
      }

      // GET /api/room/:code
      const roomMatch = url.pathname.match(/^\/api\/room\/([A-Z0-9]{4,6})$/);
      if (roomMatch && request.method === 'GET') {
        const code = roomMatch[1].toUpperCase();
        const data = await env.GIFT_ROOMS.get(code);
        if (!data) {
          return jsonResponse({ error: '房间不存在或已过期', errorCode: 'ROOM_NOT_FOUND' }, 404);
        }
        return jsonResponse(JSON.parse(data));
      }

      // POST /api/room/:code/submit-other
      if (url.pathname.match(/^\/api\/room\/([A-Z0-9]{4,6})\/submit-other$/) && request.method === 'POST') {
        const code = url.pathname.match(/^\/api\/room\/([A-Z0-9]{4,6})\/submit-other$/)[1].toUpperCase();
        const body = await request.json().catch(() => null);
        if (!body || !Array.isArray(body.answers) || body.answers.length === 0) {
          return jsonResponse({ error: '请完成所有题目' }, 400);
        }
        const data = await env.GIFT_ROOMS.get(code);
        if (!data) {
          return jsonResponse({ error: '房间不存在或已过期', errorCode: 'ROOM_NOT_FOUND' }, 404);
        }
        const room = JSON.parse(data);
        if (room.status !== 'created') {
          return jsonResponse({ error: '已提交过', errorCode: 'ALREADY_DONE' }, 409);
        }
        room.otherAnswers = body.answers;
        room.status = 'completed';
        await env.GIFT_ROOMS.put(code, JSON.stringify(room), { expirationTtl: 604800 });
        return jsonResponse({ success: true });
      }

      return jsonResponse({ error: '接口不存在' }, 404);

    } catch (e) {
      console.error('Worker error:', e);
      return jsonResponse({ error: '服务器内部错误，请稍后重试' }, 500);
    }
  },
};
