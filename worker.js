/**
 * 礼物信使 (GiftPicks) - Cloudflare Worker
 *
 * 后端 API：管理送礼/收礼房间的短码和数据映射
 *
 * KV Namespace 绑定: GIFT_ROOMS (在 wrangler.toml 中配置)
 *
 * 部署:
 *   1. 安装 Wrangler: npm install -g wrangler
 *   2. 登录: wrangler login
 *   3. 创建 KV Namespace: wrangler kv:namespace create "GIFT_ROOMS"
 *   4. 更新 wrangler.toml 中的 KV id
 *   5. 部署: wrangler deploy
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const VALID_BUDGETS = [
  '50以下', '50-100', '100-150', '150-200',
  '200-300', '300-400', '400-500', '500以上',
];

const VALID_RELATIONSHIPS = ['friend', 'lover', 'elder'];

/**
 * 生成 5 位人类友好短码
 * 去掉容易混淆的 0/O, 1/I, 减少误输
 */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** 防止短时间内同一 IP 频繁创建房间 */
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 10;

  const timestamps = rateLimitMap.get(ip) || [];
  const recent = timestamps.filter(t => now - t < windowMs);

  if (recent.length >= maxRequests) {
    return false;
  }

  recent.push(now);
  rateLimitMap.set(ip, recent);
  return true;
}

/** 验证创建房间的请求参数 */
function validateRoomRequest(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: '请求体不能为空' };
  }
  if (!body.budget || !VALID_BUDGETS.includes(body.budget)) {
    return { valid: false, error: '无效的预算档位' };
  }
  if (!body.relationship || !VALID_RELATIONSHIPS.includes(body.relationship)) {
    return { valid: false, error: '无效的关系类型' };
  }
  return { valid: true };
}

/** 格式化响应 */
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

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      const path = url.pathname;

      // -------------------------------------------------------
      // POST /api/create-room
      // 送礼方创建一个新的选礼物房间
      // Body: { budget: string, relationship: string }
      // Returns: { code: string }
      // -------------------------------------------------------
      if (path === '/api/create-room' && request.method === 'POST') {
        // 限速检查
        if (!checkRateLimit(clientIp)) {
          return jsonResponse({ error: '请求太频繁，请稍后再试' }, 429);
        }

        const body = await request.json().catch(() => null);
        const validation = validateRoomRequest(body);
        if (!validation.valid) {
          return jsonResponse({ error: validation.error }, 400);
        }

        const code = generateCode();
        const roomData = {
          budget: body.budget,
          relationship: body.relationship,
          receiverSelections: [],
          status: 'waiting',
          createdAt: Date.now(),
        };

        // 7 天过期
        await env.GIFT_ROOMS.put(code, JSON.stringify(roomData), {
          expirationTtl: 604800,
        });

        return jsonResponse({ code });
      }

      // -------------------------------------------------------
      // GET /api/room/:code
      // 通过短码获取房间数据（收礼方查看、送礼方轮询）
      // Returns: { budget, relationship, status, receiverSelections }
      // -------------------------------------------------------
      const roomGetMatch = path.match(/^\/api\/room\/([A-Z0-9]{4,6})$/);
      if (roomGetMatch && request.method === 'GET') {
        const code = roomGetMatch[1].toUpperCase();
        const data = await env.GIFT_ROOMS.get(code);

        if (!data) {
          return jsonResponse({
            error: '房间不存在或已过期',
            errorCode: 'ROOM_NOT_FOUND',
          }, 404);
        }

        const room = JSON.parse(data);
        // 对收礼方隐藏价格信息（由前端控制，但后端只返回选择结果）
        return jsonResponse({
          budget: room.budget,
          relationship: room.relationship,
          status: room.status,
          receiverSelections: room.receiverSelections,
          createdAt: room.createdAt,
        });
      }

      // -------------------------------------------------------
      // POST /api/room/:code/select
      // 收礼方提交选择
      // Body: { selections: number[] } (1-2 个礼物索引)
      // -------------------------------------------------------
      const selectMatch = path.match(/^\/api\/room\/([A-Z0-9]{4,6})\/select$/);
      if (selectMatch && request.method === 'POST') {
        const code = selectMatch[1].toUpperCase();
        const body = await request.json().catch(() => null);

        if (!body || !Array.isArray(body.selections)) {
          return jsonResponse({ error: '请选择1-2个礼物' }, 400);
        }

        const selections = body.selections.map(Number);
        if (selections.length === 0 || selections.length > 2) {
          return jsonResponse({ error: '请选择1-2个礼物' }, 400);
        }

        // 验证每个选择都是有效数字
        if (selections.some(s => !Number.isInteger(s) || s < 0)) {
          return jsonResponse({ error: '无效的选择' }, 400);
        }

        const data = await env.GIFT_ROOMS.get(code);
        if (!data) {
          return jsonResponse({
            error: '房间不存在或已过期',
            errorCode: 'ROOM_NOT_FOUND',
          }, 404);
        }

        const room = JSON.parse(data);

        if (room.status === 'completed') {
          return jsonResponse({
            error: '该房间已完成选择，不可重复提交',
            errorCode: 'ALREADY_COMPLETED',
          }, 409);
        }

        room.receiverSelections = selections;
        room.status = 'completed';
        room.completedAt = Date.now();

        await env.GIFT_ROOMS.put(code, JSON.stringify(room), {
          expirationTtl: 604800,
        });

        return jsonResponse({ success: true });
      }

      // -------------------------------------------------------
      // 404
      // -------------------------------------------------------
      return jsonResponse({ error: '接口不存在' }, 404);

    } catch (e) {
      console.error('Worker error:', e);
      return jsonResponse({ error: '服务器内部错误，请稍后重试' }, 500);
    }
  },
};
