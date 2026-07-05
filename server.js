/**
 * 本地开发/调试服务器（不依赖 Vercel CLI）
 * 用法: node server.js | npm run dev | npm run debug
 */
require('dotenv').config()
const http = require('http')
const fs = require('fs')
const path = require('path')

const postsHandler = require('./api/posts')
const postDetailHandler = require('./api/posts/[id]')
const loginHandler = require('./api/auth/login')
const registerHandler = require('./api/auth/register')

const PORT = process.env.PORT || 3000
const PUBLIC_DIR = path.join(__dirname, 'public')
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
}

/** 静态文件服务 */
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0])
  // vercel.json rewrites
  if (urlPath === '/admin') urlPath = '/admin.html'
  if (urlPath === '/login') urlPath = '/login.html'
  if (urlPath === '/') urlPath = '/index.html'

  const filePath = path.join(PUBLIC_DIR, urlPath)
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden') }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not Found') }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
    res.end(data)
  })
}

/** 读取请求体（Vercel 会自动注入 req.body，原生 Node 需手动读取） */
function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => resolve(raw))
    req.on('error', () => resolve(''))
  })
}

const server = http.createServer(async (req, res) => {
  const pathname = req.url.split('?')[0]

  // 兼容 Vercel/Express 风格的 res.status().json() 链式调用
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(data))
    return res
  }

  // 预填充 req.body（API 路由的 getBody 依赖此字段）
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    req.body = await readBody(req)
  }

  try {
    // /api/posts/:id（数字）
    if (/^\/api\/posts\/\d+/.test(pathname)) return await postDetailHandler(req, res)
    // /api/posts
    if (pathname === '/api/posts') return await postsHandler(req, res)
    // /api/auth/login
    if (pathname === '/api/auth/login') return await loginHandler(req, res)
    // /api/auth/register（仅 standalone 模式）
    if (pathname === '/api/auth/register') return await registerHandler(req, res)
    // 静态文件
    return serveStatic(req, res)
  } catch (err) {
    console.error('Server error:', err)
    if (!res.headersSent) { res.writeHead(500); res.end('Internal Server Error') }
  }
})

server.listen(PORT, () => {
  console.log(`\n  Hitorigoto 本地服务器已启动`)
  console.log(`  → http://localhost:${PORT}`)
  console.log(`  → 管理: http://localhost:${PORT}/admin`)
  console.log(`  → 登录: http://localhost:${PORT}/login`)
  if (process.env.DATABASE_URL) {
    console.log(`  → 数据库: 已连接 Neon (DATABASE_URL 已加载)`)
  } else {
    console.log(`  ⚠ 未检测到 DATABASE_URL，请复制 .env.example 为 .env 并填入连接字符串`)
  }
  console.log('')
})
