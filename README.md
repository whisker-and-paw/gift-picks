# 🧸 礼物信使 (GiftPicks)

治愈系生日礼物挑选互动网页。

送礼方选择预算和关系 → 生成专属密令（短码+二维码）→ 收礼方扫码/输入密令 → 在精心筛选的礼物中凭喜好挑选 1-2 个 → 结果回传送礼方。

## 项目结构

```
gift-picks/
├── index.html      # 主应用（单文件，可直接托管到 GitHub Pages）
├── worker.js       # Cloudflare Worker 后端（短码 ↔ 数据映射）
├── wrangler.toml   # Wrangler 部署配置
└── README.md       # 本文件
```

## 技术方案

| 层 | 方案 | 成本 | 说明 |
|---|---|---|---|
| 前端 | GitHub Pages | 免费 | 单文件 HTML，纯静态托管 |
| 后端 API | Cloudflare Workers | 免费（10 万请求/天） | 轻量无服务器函数 |
| 数据存储 | Cloudflare Workers KV | 免费（1GB 存储） | 短码 ↔ JSON 数据映射，7 天自动过期 |

### 技术选型理由

- **Cloudflare Workers + KV**：免费额度对副业项目极其充裕（10万请求/天），全球边缘网络延迟低，KV 的 TTL 自动过期正好满足"7天有效"的产品需求
- **QR 码**：使用 `qrcodejs` 库客户端生成（CDN），无需额外 API 调用；备选方案回退到 `api.qrserver.com` 在线生成
- **音效**：Web Audio API 合成音效，无任何版权音乐，无需加载音频文件
- **动画**：纯 CSS `@keyframes` +  Canvas confetti，零依赖

## 部署步骤

### 第一步：部署后端（Cloudflare Worker）

1. **安装 Wrangler CLI**

   ```bash
   npm install -g wrangler
   ```

2. **登录 Cloudflare**

   ```bash
   wrangler login
   ```
   浏览器会自动打开 Cloudflare 登录页面，授权即可。

3. **创建 KV Namespace**

   ```bash
   wrangler kv:namespace create "GIFT_ROOMS"
   ```

   输出类似：
   ```
   🌀  Success: KV namespace with id "abc123..."
   ```

   把输出的 `id` 复制到 `wrangler.toml` 中：

   ```toml
   [[kv_namespaces]]
   binding = "GIFT_ROOMS"
   id = "abc123..."    # ← 替换为你的 ID
   ```

4. **部署 Worker**

   ```bash
   wrangler deploy
   ```

   部署成功后会输出类似：
   ```
   https://gift-picks.你的子域.workers.dev
   ```

5. **记住你的 Worker 地址**，下一步会用到。

### 第二步：配置前端（index.html）

1. 打开 `index.html`
2. 找到 `CONFIG` 对象的 `API_BASE` 字段（约第 530 行）：

   ```javascript
   const CONFIG = {
     API_BASE: 'https://gift-picks.example.workers.dev',  // ← 替换为你的 Worker 地址
   ```

3. 替换为第一步部署获得的 Worker URL（去掉末尾的 `/`）

### 第三步：部署前端（GitHub Pages）

1. 在 GitHub 上创建一个新仓库（例如 `gift-picks`）
2. 将所有文件上传到仓库：

   ```
   gift-picks/
   ├── index.html      # 修改过 API_BASE 的主文件
   ├── worker.js       # Cloudflare Worker（供参考）
   ├── wrangler.toml   # 部署配置
   └── README.md
   ```

3. 在仓库 Settings → Pages 中：
   - Source: **Deploy from a branch**
   - Branch: `main` (或你的默认分支)
   - Folder: `/ (root)`
   - 点击 Save

4. 等待几分钟，GitHub Pages 会生成你的公开地址：
   ```
   https://你的用户名.github.io/gift-picks/
   ```

### 第四步：验证

1. 打开 GitHub Pages 地址
2. 点击「我要送礼」→ 选择预算「100-200」→ 选择关系「朋友」→ 生成密令
3. 看到 5 位密令和二维码即表示后端工作正常
4. 用手机扫码（或在另一浏览器打开二维码链接），应自动填入密令并进入礼物选择页
5. 选 1-2 个礼物提交后，返回送礼方页面（或点击「查询结果」），看到收礼方的选择

## 礼物库内容

当前 MVP 版本包含：**「朋友」** 关系下 **全部 8 档预算** 的礼物推荐，每档 5-7 个精心挑选的具体礼物，涵盖：

- 🎁 **实物精品**：手账本、香薰、盲盒、钢笔等
- 🎮 **虚拟礼物**：游戏皮肤、音乐年卡、储值卡等
- 🎫 **体验类**：电影票、自助餐、展览票、SPA 等

**恋人** 和 **长辈** 两种关系类型的礼物库将在 MVP 确认后补全。

## 错误处理

- **后端不可用**：页面会弹出清晰的提示"小邮差联系不上总部..."，不会白屏
- **密令过期**：提示"密令不存在或已过期"
- **重复提交**：提示"已经选过啦"
- **无效密令**：提示"密令无效"

如果 Cloudflare Worker 的服务未来失效，只需要将 `API_BASE` 指向新的后端地址即可切换，前端无需其他改动。

## 开发说明

### 本地测试

```bash
# 启动本地 Worker 开发服务器（需要先配置 KV 的 preview_id）
wrangler dev
```

### 礼物数据格式

```javascript
{
  id: 0,                // 唯一 ID（同一预算档位内）
  name: '礼物名称',      // 简短有吸引力的名字
  desc: '描述文字',      // 1-2 句话，有画面感
  price: 128,           // 价格（仅送礼方可见）
  category: '实物精品',  // 分类：实物精品 / 虚拟礼物 / 体验类
  emoji: '🎨',          // 展示用 emoji
}
```

### 添加新礼物

在 `GIFT_DATA` 对象中按 `关系 → 预算档位` 的层级添加即可。注意：

- 每档预算准备 **6-8 个** 具体礼物
- 覆盖 **实物精品 / 虚拟礼物 / 体验类** 三种类型
- 使用 **有画面感的描述**，不要写"精美礼品"这种空泛描述
- 价格信息只在送礼方那端展示

## 许可

MIT
