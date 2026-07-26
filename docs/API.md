# Hitorigoto API 参考

本文档定义 Hitorigoto 服务端与前端 Widget 之间的 API 契约。任何兼容的 Hitorigoto 后端应当实现以下接口。

## 通用约定

### 基础 URL

API 路径相对于部署根路径。例如部署于 `https://example.com`，访问地址为 `https://example.com/api/...`。

### 认证模式

每个站点固定使用一种认证模式。部署时决定，运行时不切换。

- `waline` — 使用 Waline 的 `wl_users` 表进行认证
- `hitorigoto` — 使用 Hitorigoto 自有的 `hg_admin` 表

认证模式通过以下方式传递给服务端（优先级递减）：
1. HTTP 请求头 `X-HG-Auth-Mode`
2. 查询参数 `authMode`

> **注意**: 运行时覆盖认证模式仅用于调试和迁移场景。生产环境应通过环境变量固定。

### 认证方式

管理接口使用 **Bearer Token** 认证。

Token 格式：`base64(email:password)`

```http
Authorization: Bearer <base64编码的 email:password>
```

Token 无过期时间。退出登录时客户端自行清除。

### 响应格式

**成功响应**：直接返回数据对象或数组。

**错误响应**：

```json
{ "error": "错误描述信息" }
```

### HTTP 状态码

| 状态码 | 含义 |
|---|---|
| `200` | 成功 |
| `201` | 创建成功 |
| `204` | 删除成功（或 OPTIONS 预检） |
| `400` | 请求参数错误 |
| `401` | 未认证（Token 缺失或无效） |
| `404` | 资源不存在 |
| `405` | 不允许的 HTTP 方法 |
| `500` | 服务端内部错误 |

### CORS

所有响应均包含以下 CORS 头：

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

对于 `OPTIONS` 预检请求，返回 `204 No Content`。

## 公开接口（无需认证）

### 获取动态列表

```http
GET /api/posts
```

#### 查询参数

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `page` | integer | `0` | 页码（从 0 开始） |
| `pageSize` | integer | `10` | 每页条数（最大 `100`） |

#### 响应

```json
{
  "posts": [
    {
      "id": 1,
      "content_md": "今天天气真好～",
      "content_html": "<p>今天天气真好～</p>",
      "os": "Windows",
      "browser": "Chrome",
      "createdAt": "2026-06-28T06:30:00.000Z",
      "updatedAt": "2026-06-28T06:30:00.000Z",
      "avatar": "https://seccdn.libravatar.org/avatar/xxx?d=mp&s=64"
    }
  ],
  "display_name": "管理员名称",
  "total": 42,
  "page": 0,
  "pageSize": 10
}
```

#### 行为说明

- 只返回 `status = 'published'` 或 `status = 'pinned'` 的动态
- `status = 'hidden'` 的动态不会出现在公开列表中
- 结果按 `createdAt DESC` 排序，但 `pinned` 动态优先显示（按置顶时间排序）
- `avatar` 和 `display_name` 来自管理员信息，每条动态相同

### 获取单条动态

```http
GET /api/posts/:id
```

#### 路径参数

| 参数 | 类型 | 说明 |
|---|---|---|
| `id` | integer | 动态 ID（必须大于 0） |

#### 响应

```json
{
  "id": 1,
  "content_md": "今天天气真好～",
  "content_html": "<p>今天天气真好～</p>",
  "os": "Windows",
  "browser": "Chrome",
  "createdAt": "2026-06-28T06:30:00.000Z",
  "updatedAt": "2026-06-28T06:30:00.000Z",
  "avatar": "https://seccdn.libravatar.org/avatar/xxx?d=mp&s=64"
}
```

#### 行为说明

- 公开（`published` / `pinned`）和隐藏（`hidden`）的动态均可通过此接口获取
- 如果动态不存在，返回 `404`

## 认证接口

### 登录

```http
POST /api/auth/login
```

#### 请求体

```json
{
  "email": "admin@example.com",
  "password": "your-password"
}
```

#### 响应

```json
{
  "token": "YWRtaW5AZXhhbXBsZS5jb206eW91ci1wYXNzd29yZA==",
  "display_name": "管理员名称",
  "email": "admin@example.com"
}
```

#### 行为说明

- 返回的 `token` 是 `base64(email:password)`，客户端应存储到 `localStorage` / `sessionStorage`
- 后续管理请求通过 `Authorization: Bearer <token>` 携带

### 注册管理员（仅 hitorigoto 模式）

```http
POST /api/auth/register
```

#### 请求体

```json
{
  "username": "admin",
  "email": "admin@example.com",
  "password": "your-password",
  "display_name": "管理员"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `username` | string | 是 | 用户名 |
| `email` | string | 是 | 登录邮箱 |
| `password` | string | 是 | 密码 |
| `display_name` | string | 否 | 显示名称（默认使用 `username`） |

#### 行为说明

- 仅在 `hg_admin` 表为空时可调用（首次注册）
- 调用成功后，后续通过登录接口获取 Token

## 管理接口（需 Bearer Token）

所有管理接口要求请求头包含：

```http
Authorization: Bearer <base64(email:password)>
```

### 发布动态

```http
POST /api/posts
```

#### 请求体

```json
{
  "content_md": "今天天气真好～"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `content_md` | string | 是 | Markdown 格式的动态内容 |

#### 响应（201 Created）

```json
{
  "id": 1,
  "content_md": "今天天气真好～",
  "content_html": "<p>今天天气真好～</p>",
  "os": "Windows",
  "browser": "Chrome",
  "createdAt": "2026-06-28T06:30:00.000Z",
  "updatedAt": "2026-06-28T06:30:00.000Z"
}
```

#### 行为说明

- `os` 和 `browser` 自动从请求的 `User-Agent` 头部解析
- 新动态的 `status` 默认为 `published`
- `content_html` 由服务端通过 Showdown 将 `content_md` 自动渲染生成

### 编辑动态

```http
PUT /api/posts/:id
```

#### 路径参数

| 参数 | 类型 | 说明 |
|---|---|---|
| `id` | integer | 动态 ID（必须大于 0） |

#### 请求体

```json
{
  "content_md": "修改后的内容～"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `content_md` | string | 是 | Markdown 格式的新内容 |

#### 响应

```json
{
  "id": 1,
  "content_md": "修改后的内容～",
  "content_html": "<p>修改后的内容～</p>",
  "os": "Windows",
  "browser": "Chrome",
  "createdAt": "2026-06-28T06:30:00.000Z",
  "updatedAt": "2026-06-28T07:00:00.000Z"
}
```

#### 行为说明

- `updatedAt` 自动更新为当前时间
- `content_html` 重新渲染
- 如果动态不存在，返回 `404`

### 删除动态

```http
DELETE /api/posts/:id
```

#### 路径参数

| 参数 | 类型 | 说明 |
|---|---|---|
| `id` | integer | 动态 ID（必须大于 0） |

#### 响应

```json
{ "success": true }
```

#### 行为说明

- 物理删除，不可恢复
- 如果动态不存在，返回 `404`

## 附录：Post 数据结构

### hg_posts（数据库表）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | int (PK, auto) | 自增主键 |
| `content_md` | text | Markdown 原文 |
| `content_html` | text | Showdown 转换后的 HTML |
| `status` | varchar(20) | `published` \| `hidden` \| `pinned`，默认 `published` |
| `os` | varchar(100) | 操作系统 |
| `browser` | varchar(100) | 浏览器 |
| `createdAt` | timestamp | 创建时间 |
| `updatedAt` | timestamp | 最后更新时间 |
