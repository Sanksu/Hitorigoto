# ひとりごと (Hitorigoto)

实时动态发布系统，基于 Vercel + Neon PostgreSQL。支持与 [Waline](https://waline.js.org/) 共用数据库或独立管理。

## 特性

- **支持 Markdown** — ShowdownJS 渲染，highlight.js 代码高亮
- **双认证模式** — 可选择与 Waline 共用管理员账号（`wl_users`）或独立管理（`hg_admin`）
- **易于嵌入** — 一条 `<script>` 接入任意页面，支持多实例
- **样式自定义** — CSS 变量驱动的主题系统
- **后台管理** — 发布 / 编辑 / 删除，分页浏览，`Ctrl+Enter` 快捷键

## 项目结构

```
hitorigoto/
├── api/
│   ├── _lib/db.js          # 核心模块：数据库连接、认证、工具函数
│   ├── auth/login.js       # POST /api/auth/login   → 登录并返回 Token
│   ├── auth/register.js    # POST /api/auth/register→ 注册管理员（仅 hitorigoto 模式）
│   ├── posts/index.js      # GET|POST  /api/posts   → 分页列表 / 发布动态
│   └── posts/[id].js       # GET|PUT|DEL /api/posts/:id → 单条查询 / 编辑 / 删除
├── public/
│   ├── hitorigoto.js       # 前端嵌入式组件（可独立引入）
│   ├── hitorigoto.css      # 前端组件样式表（CSS 自定义属性驱动，支持主题定制）
│   ├── admin.html          # 后台管理页面
│   ├── login.html          # 登录页面
│   └── index.html          # 前端首页（嵌入示例）
├── schema.sql              # 数据库建表 SQL
├── package.json
├── vercel.json             # 路由重写规则
└── .env.example            # 环境变量模板
```

## 快速开始

### 1. 创建数据表

在 Neon SQL Editor 执行 [schema.sql](schema.sql)：

```sql
-- 执行 schema.sql 中的 SQL（包含 hg_posts 和 hg_admin 两张表）
```

> **Waline 模式**: 需要先部署 Waline 并在 `wl_users` 表中存在 `type='administrator'` 的管理员记录。
> **Hitorigoto 模式**: 不需要 Waline，执行 schema.sql 后通过 API 注册管理员即可（见下方「注册管理员」）。

### 2. 环境变量

| 变量名 | 说明 |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL 连接字符串 |
| `POSTGRES_URL` | 可选，优先级高于 `DATABASE_URL`（Vercel Neon 集成默认注入） |

复制 `.env.example` 为 `.env` 并填入连接字符串。

### 3. 本地开发 & 部署

```bash
npm install          # 安装依赖
npm run dev          # 本地启动 (node server.js，默认端口 3000)
```

部署到生产环境时，将项目部署到任意支持 Node.js 的平台（Vercel / 自建服务器等），确保环境变量 `DATABASE_URL` 已正确配置。

### 4. 本地调试

项目使用原生 Node.js HTTP 服务器（`server.js`），无需 Vercel CLI。通过 dotenv 加载 `.env` 环境变量，直连 Neon 数据库。

```bash
cp .env.example .env   # Windows: copy .env.example .env
# 编辑 .env 填入 DATABASE_URL
```

`server.js` 启动时通过 `require('dotenv').config()` 自动加载 `.env` 文件。

```bash
npm run debug        # node --inspect=9229 server.js
```

#### 本地路由说明

`server.js` 内置路由映射，无需 Vercel 配置：

| 路径 | 说明 |
|---|---|
| `/api/posts` | 动态列表 API（GET 查询 / POST 发布） |
| `/api/posts/:id` | 单条动态 API（GET / PUT / DELETE） |
| `/api/auth/login` | 管理员登录 |
| `/admin` | 管理后台（映射到 `public/admin.html`） |
| `/login` | 登录页（映射到 `public/login.html`） |
| 其他 | 静态文件服务（`public/` 目录） |

> **注意**: 本地调试直接连接 Neon 远程数据库，数据变更会影响生产。建议在 Neon 创建独立的 dev 分支数据库进行调试。

## 使用方式

### 前端嵌入

```html
<link rel="stylesheet" href="https://your-domain.vercel.app/hitorigoto.css">
<div id="hitorigoto"></div>
<script src="https://your-domain.vercel.app/hitorigoto.js"></script>
<script>
Hitorigoto.init({
  serverURL: 'https://your-domain.vercel.app',
  el: '#hitorigoto'
})
</script>
```

### 配置参数

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|---|---|---|---|---|
| `serverURL` | string | - | **是** | 部署地址（含协议，不含尾斜杠） |
| `el` | string | `'#hitorigoto'` | 否 | 容器 DOM 选择器 |
| `pageSize` | number | `5` | 否 | 每页加载条数 |
| `lang` | string | `'zh'` | 否 | 语言: `'zh'` / `'en'`。支持运行时通过 `instance.setLang('en')` 动态切换 |
| `authMode` | string | `'waline'` | 否 | 认证模式: `'waline'`（与 Waline 共用）或 `'hitorigoto'`（独立 `hg_admin` 表） |
| `name` | string | `'Hitorigoto'` | 否 | 卡片中显示的用户名。不设置时自动从数据库 `wl_users` / `hg_admin` 的 `display_name` 获取 |
| `theme` | object | `null` | 否 | 主题定制对象（详见下方样式定制） |

### 头像逻辑

头像不存储在动态表中，每次请求时实时计算优先级链：

1. `wl_users.avatar` 字段（Waline 用户自定义头像）
2. Libravatar（基于管理员邮箱 MD5 哈希）
3. Libravatar 默认神秘人物（前端兜底）

---

## 样式定制

Hitorigoto 提供三种不同粒度的样式定制方式。

### 方式一：CSS 变量覆盖（推荐）

组件使用 CSS 自定义属性（CSS Variables）驱动所有可视属性。你只需在自己的样式表中覆盖对应变量即可：

```css
/* 覆盖默认变量 — 推荐放在你网站的主样式表中 */
.hg_main {
  --hg-accent: #1a73e8;           /* 强调色（链接、按钮、加载点） */
  --hg-card-radius: 8px;           /* 卡片圆角 */
  --hg-card-shadow: 0 2px 8px rgba(0,0,0,.06);  /* 卡片阴影 */
  --hg-font-family: "Noto Sans SC", sans-serif;  /* 字体 */
  --hg-card-bg: #fafafa;           /* 卡片背景色 */
}
```

#### 可用 CSS 变量完整列表

| 变量名 | 默认值 | 影响元素 |
|---|---|---|
| `--hg-font-family` | `-apple-system, ...` | 整体字体 |
| `--hg-accent` | `#ff7d49` | 强调色（链接、按钮、加载点） |
| `--hg-card-bg` | `#fff` | 卡片背景色 |
| `--hg-card-radius` | `16px` | 卡片圆角 |
| `--hg-card-padding` | `20px` | 卡片内边距 |
| `--hg-card-gap` | `20px` | 卡片间距 |
| `--hg-card-shadow` | `0 1px 3px rgba(...)` | 卡片阴影 |
| `--hg-text-primary` | `#333` | 主要文字（用户名） |
| `--hg-text-secondary` | `#444` | 次要文字（动态内容） |
| `--hg-text-muted` | `#888` | 弱化文字（时间、底部信息） |
| `--hg-text-light` | `#999` | 加载文字 |
| `--hg-text-lighter` | `#bbb` | 空状态文字 |
| `--hg-border-color` | `#f0f0f0` | 边框（卡片分隔线、分隔线） |
| `--hg-border-strong` | `#ddd` | 强边框（引用块、表格） |
| `--hg-code-bg` | `#f0f0f0` | 行内代码背景色 |
| `--hg-avatar-border` | `#f0f0f0` | 头像边框 |

### 方式二：通过 `theme` 参数在初始化时定制

在 `init()` 中传入 `theme` 对象，组件会自动将其转换为实例级别的 CSS 变量注入。

**参数规则：**
- 使用 camelCase 键名（如 `cardRadius`）
- 值可以是任意合法的 CSS 属性值
- 键名会自动映射为 `--hg-*` 格式（`cardRadius` → `--hg-card-radius`）
- 样式仅作用于当前实例，不影响页面中其他 Hitorigoto 实例

```javascript
// 单个实例定制
Hitorigoto.init({
  serverURL: 'https://your-domain.vercel.app',
  el: '#hitorigoto',
  name: '我的博客',
  theme: {
    accent: '#e91e63',           // 粉色强调
    cardRadius: '12px',           // 较小圆角
    cardShadow: '0 4px 12px rgba(233,30,99,.1)',
    fontFamily: '"Noto Sans SC", "PingFang SC", sans-serif',
    cardBg: '#fffbfb'
  }
})

// 页面中多个实例各自独立定制
Hitorigoto.init({
  serverURL: 'https://your-domain.vercel.app',
  el: '#recent-posts',
  pageSize: 3,
  name: '最新动态',
  theme: { accent: '#4caf50', cardRadius: '6px' }
})

Hitorigoto.init({
  serverURL: 'https://your-domain.vercel.app',
  el: '#archived-posts',
  pageSize: 10,
  name: '归档',
  theme: { accent: '#607d8b', cardBg: '#f5f5f5' }
})
```

**theme 对象与 CSS 变量映射关系：**

```javascript
theme: {
  accent: '#e91e63',       // → --hg-accent: #e91e63
  cardRadius: '12px',      // → --hg-card-radius: 12px
  cardShadow: '...',       // → --hg-card-shadow: ...
  fontFamily: '...',       // → --hg-font-family: ...
  cardBg: '#fffbfb',       // → --hg-card-bg: #fffbfb
  textPrimary: '#222',     // → --hg-text-primary: #222
}
```

> **注意**: `theme` 参数注入的样式优先级**高于**外部 CSS 文件中的默认值，但**低于**用户直接写在 `.hg_main` 上的 CSS 变量覆盖。如果同时使用方式一和方式二，方式一的覆盖会胜出。

### 方式三：直接覆盖 CSS 类

对于无法通过变量表达的定制（如布局调整、隐藏元素），可以直接覆盖组件的 CSS 类：

```css
/* 修改卡片布局 */
.hg_main .hg_card {
  padding: 24px 16px;           /* 调整内边距 */
  border: 1px solid #eee;       /* 添加边框 */
}

/* 隐藏页面底部管理入口 */
.al { display: none; }

/* 自定义头像样式 */
.hg_main .hg_card_avatar {
  border-radius: 12px;          /* 方形头像 */
  border-color: var(--hg-accent);
  padding: 3px;
}

/* 修改"加载更多"按钮 */
.hg_main .hg_btn {
  border-radius: 4px;           /* 直角按钮 */
  font-size: 13px;
  padding: 10px 24px;
}
```

### 优先级总结

| 优先级 | 方式 | 作用域 | 示例 |
|---|---|---|---|
| 1 (最高) | 外部 CSS 覆盖 `.hg_main` | 全局 | `.hg_main { --hg-accent: red; }` |
| 2 | `theme` 参数 | 实例级别 | `theme: { accent: 'red' }` |
| 3 (默认) | `hitorigoto.css` 默认值 | 全局 | `--hg-accent: #ff7d49` |

---

## 动态生成的 HTML 结构

调用 `Hitorigoto.init()` 后，组件会在目标容器内动态生成以下 DOM 结构：

```html
<!-- 外层容器（对应 init 的 el 参数，由用户提供） -->
<div id="hitorigoto">

  <!-- 组件根节点：.hg_main = 样式作用域，id = 实例唯一标识 -->
  <div id="hg_a1b2c3d4" class="hg_main">

    <!-- 时间线容器 -->
    <div id="hg_timeline_hg_a1b2c3d4">

      <!-- 动态列表：通过 _renderPosts() 填充 <li> -->
      <ul class="hg_timeline" id="hg_list_hg_a1b2c3d4">

        <!-- 每条动态是一个卡片 -->
        <li class="hg_post">
          <div class="hg_card">
            <div class="hg_card_header">
              <img class="hg_card_avatar"
                   src="https://xxx/avatar.jpg"
                   width="44" height="44"
                   onerror="this.style.display='none'">
              <div class="hg_card_info">
                <span class="hg_card_name">我的动态</span>
                <span class="hg_card_time">2026/06/28 14:30</span>
              </div>
            </div>
            <div class="hg_card_body hg_content">
              <p>今天天气真好～</p>
              <pre><code class="hljs">console.log('hello')</code></pre>
            </div>
            <div class="hg_card_footer">
              Windows · Chrome · 修改于 2026/06/28 15:00
            </div>
          </div>
        </li>

      </ul>
    </div>

    <!-- 加载更多按钮（有更多数据时显示） -->
    <div class="hg_loadmore" id="hg_more_hg_a1b2c3d4" style="display:block">
      <button class="hg_btn"
              onclick="Hitorigoto.instances['hg_a1b2c3d4']._loadMore()">
        加载更多...
      </button>
    </div>

    <!-- 加载中指示器 -->
    <div class="hg_loading" id="hg_load_hg_a1b2c3d4" style="display:none">
      <div class="hg_dots">
        <span></span><span></span><span></span>
      </div>
      <p style="margin-top:8px">加载中...</p>
    </div>

    <!-- 空状态提示 -->
    <div class="hg_empty" id="hg_none_hg_a1b2c3d4" style="display:none">
      还没有动态~
    </div>

  </div>
</div>
```

### HTML 结构元素对照表

| 选择器 | 类型 | 说明 | 条件 |
|---|---|---|---|
| `.hg_main` | 作用域容器 | 所有样式的 CSS 作用域根节点 | 始终存在 |
| `#hg_timeline_*` | 时间线容器 | 包裹动态列表 | 始终存在 |
| `ul.hg_timeline` | 动态列表 | `<li>` 项的容器 | 始终存在 |
| `li.hg_post` | 卡片包裹 | 每条动态的外层 | 有动态数据时 |
| `.hg_card` | 卡片容器 | 白色背景、圆角、阴影 | 有动态数据时 |
| `.hg_card_header` | 卡片头部 | flex 布局，头像 + 信息区 | 有动态数据时 |
| `img.hg_card_avatar` | 头像 | 44×44, 圆形, 2px 边框 | 有动态数据时 |
| `.hg_card_info` | 信息容器 | 用户名 + 时间 | 有动态数据时 |
| `.hg_card_name` | 用户名 | `name` 配置项的值 | 有动态数据时 |
| `.hg_card_time` | 发布时间 | `YYYY/MM/DD HH:mm` | 有动态数据时 |
| `.hg_card_body.hg_content` | 动态正文 | Markdown HTML 内容 | 有动态数据时 |
| `.hg_card_footer` | 底部元信息 | 系统 · 浏览器 · 编辑标记 | 有元信息时 |
| `.hg_loadmore` | 加载更多区域 | 内含 `.hg_btn` 按钮 | 有下一页时 |
| `.hg_btn` | 加载按钮 | 点击触发 `_loadMore()` | 有下一页时 |
| `.hg_loading` | 加载状态 | 含 `.hg_dots` 动画 | 请求进行中 |
| `.hg_dots span` | 加载动画点 | 三个弹跳圆点 | 加载中 |
| `.hg_empty` | 空状态 | 无数据时显示 | 首次加载无数据 |

---

## 认证机制

采用 **Base64 Token** 无状态认证：

- 登录时服务端返回 `base64(email:password)`，客户端存储到 localStorage / sessionStorage
- 每次管理请求通过 `Authorization: Bearer <token>` 携带
- 服务端解码后实时查询数据库 + bcrypt 验证，无需 Session 存储
- 退出登录时客户端清除 Token

### 双认证模式

通过 `Hitorigoto.init()` 中的 `authMode` 参数切换：

| 模式 | `authMode` 值 | 说明 | 用户表 |
|---|---|---|---|
| Waline 兼容 | `waline`（默认） | 与 Waline 共用管理员账号，适合已有 Waline 部署，头像自动同步 | `wl_users` |
| 独立管理 | `hitorigoto` | 使用独立的 `hg_admin` 表，无需 Waline | `hg_admin` |

#### Waline 模式（默认）

```js
// 前端初始化
Hitorigoto.init({ serverURL: '...', authMode: 'waline' })
```

- 使用 Waline 的 `wl_users` 表进行认证
- 要求 `wl_users` 表中存在 `type='administrator'` 的记录
- 头像优先级: `wl_users.avatar` > Libravatar > 默认神秘人物
- 管理员通过 Waline 后台注册

#### Hitorigoto 模式

```js
// 前端初始化
Hitorigoto.init({ serverURL: '...', authMode: 'hitorigoto' })
```

- 使用独立的 `hg_admin` 表进行认证
- 首次使用需注册管理员（API 方式）

```bash
# 注册管理员（仅首次，hg_admin 表为空时可调用）
curl -X POST https://your-domain.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@example.com","password":"your-password","display_name":"管理员"}'

# 之后使用邮箱+密码正常登录
curl -X POST https://your-domain.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}'
```

> **前端传递方式**: 前端 `init({ authMode: 'hitorigoto' })` 会在 API 请求中自动添加 `authMode` 查询参数；登录时可将 `authMode` 放入请求体中。优先级: 请求参数 > 环境变量。

## 后台管理

访问 `/admin`，使用 Waline 管理员邮箱和密码登录（或独立账号，取决于 `authMode`）。

功能：
- **发布新动态** — Markdown 编辑
- **编辑/删除** — 表格操作行内完成
- **分页浏览** — 默认每页 10 条
- **快捷键** — `Ctrl + Enter` 提交发布/保存修改

## API 接口

### 公开接口（无需认证）

| 方法 | 路径 | 参数 | 说明 |
|---|---|---|---|
| `GET` | `/api/posts` | `page`, `pageSize` | 动态列表（分页） |
| `GET` | `/api/posts/:id` | - | 单条动态详情 |

### 认证接口

| 方法 | 路径 | Body | 说明 |
|---|---|---|---|
| `POST` | `/api/auth/login` | `{ email, password }` | 登录，返回 `{ token, display_name, email }` |
| `POST` | `/api/auth/register` | `{ username, email, password, display_name? }` | 注册管理员（仅 hitorigoto 模式，仅首次可用） |

### 管理接口（需 Bearer Token）

| 方法 | 路径 | Body | 说明 |
|---|---|---|---|
| `POST` | `/api/posts` | `{ content_md }` | 发布动态，返回 201 |
| `PUT` | `/api/posts/:id` | `{ content_md }` | 编辑动态内容 |
| `DELETE` | `/api/posts/:id` | - | 删除动态 |

**响应格式**:

```json
// 成功（列表）
{ "posts": [...], "display_name": "管理员名称", "total": 42, "page": 0, "pageSize": 5 }
// 或单条 { "id": 1, "content_html": "...", ... }

// 错误
{ "error": "错误描述" }
```

> `display_name` 字段来自 `wl_users` / `hg_admin` 表的 `display_name`，前端组件自动取此值作为卡片用户名默认值。

## 数据库

与 Waline 共用（可选）Neon PostgreSQL，新增两张表：

### hg_posts（动态表）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | int (PK, auto) | 自增主键 |
| `content_md` | text | Markdown 原文 |
| `content_html` | text | Showdown 转换后的 HTML |
| `os` | varchar(100) | 操作系统（如 `Windows`） |
| `browser` | varchar(100) | 浏览器（如 `Chrome`） |
| `createdAt` | timestamp | 创建时间 |
| `updatedAt` | timestamp | 最后更新时间 |

### hg_admin（管理员表，仅 hitorigoto 模式使用）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | int (PK, auto) | 自增主键 |
| `username` | varchar(100) | 用户名 |
| `email` | varchar(254) | 登录邮箱（唯一索引） |
| `password` | varchar(60) | bcrypt 密码哈希 |
| `display_name` | varchar(100) | 显示名称 |
| `avatar` | varchar(500) | 头像 URL |
| `createdAt` | timestamp | 创建时间 |

## 技术细节

### 核心模块 ([api/_lib/db.js](api/_lib/db.js))

| 导出函数 | 说明 |
|---|---|
| `getSql()` | Neon SQL 查询实例（懒加载单例） |
| `adminAuth(req)` | 管理员身份验证（Base64 Token，无状态） |
| `mdConverter` | Showdown Converter 全局单例 |
| `corsResponse(res)` | OPTIONS 预检响应 |
| `jsonResponse(res, data, status?)` | JSON 响应（含 CORS 头） |

### 依赖

| 包名 | 版本 | 用途 |
|---|---|---|
| `@neondatabase/serverless` | ^0.9.0 | Neon PostgreSQL 驱动（标签模板字面量 SQL） |
| `bcryptjs` | ^2.4.3 | 密码哈希比对 |
| `showdown` | ^2.1.0 | Markdown → HTML 转换 |

## 许可证

MIT
