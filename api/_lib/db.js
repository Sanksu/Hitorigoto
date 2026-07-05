/**
 * @fileoverview Hitorigoto 核心模块 - 数据库连接、认证、工具函数
 * @module _lib/db
 *
 * 依赖: @neondatabase/serverless, bcryptjs, showdown
 * 环境变量: DATABASE_URL / POSTGRES_URL (Neon PostgreSQL 连接字符串)
 */

const { neon } = require('@neondatabase/serverless')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const showdown = require('showdown')

// ============================================
// 数据库连接（单例模式）
// ============================================

/** @type {import('@neondatabase/serverless').NeonQueryFunction<any, any> | null} */
let _sql = null

/**
 * 获取 Neon SQL 查询实例（懒加载单例）
 * @returns {import('@neondatabase/serverless').NeonQueryFunction<any, any>}
 * @throws {Error} 未设置数据库连接字符串时抛出
 */
function getSql() {
  if (!_sql) {
    const url = process.env.POSTGRES_URL || process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL or POSTGRES_URL not set')
    _sql = neon(url)
  }
  return _sql
}

// ============================================
// 认证中间件（双模式：Waline 兼容 / Hitorigoto 独立管理）
// ============================================

/**
 * 获取当前认证模式
 * 优先级: 请求头 X-HG-Auth-Mode > 查询参数 authMode > 请求体 authMode
 * @param {import('http').IncomingMessage} [req] - 请求对象，不传时返回默认值 waline
 * @returns {'waline'|'hitorigoto'}
 */
function getAuthMode(req) {
  // 从请求读取
  if (req) {
    var fromHeader = req.headers && req.headers['x-hg-auth-mode']
    if (fromHeader) return fromHeader === 'hitorigoto' ? 'hitorigoto' : 'waline'

    var query = req.url ? new URLSearchParams(req.url.split('?')[1] || '') : null
    if (query) {
      var fromQuery = query.get('authMode')
      if (fromQuery) return fromQuery === 'hitorigoto' ? 'hitorigoto' : 'waline'
    }
  }
  return 'waline'
}

/**
 * Token 解码辅助：从 Bearer Token 提取 email 和 password
 * Token 格式: base64(email:password)
 * @param {import('http').IncomingMessage} req
 * @returns {{ email: string; password: string } | null}
 */
function decodeToken(req) {
  var token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return null
  try {
    var decoded = Buffer.from(token, 'base64').toString('utf-8')
    var sepIdx = decoded.indexOf(':')
    if (sepIdx === -1) return null
    return {
      email: decoded.substring(0, sepIdx),
      password: decoded.substring(sepIdx + 1)
    }
  } catch (e) {
    return null
  }
}

/**
 * 验证管理员身份（根据认证模式自动选择认证方式）
 * Token 格式: base64(email:password)，每次请求实时验证数据库
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<Object|false>} 认证成功返回用户对象，失败返回 false
 */
async function adminAuth(req) {
  return getAuthMode(req) === 'hitorigoto'
    ? authByTable(req, 'hg_admin')
    : authByTable(req, 'wl_users', true)
}

/**
 * 通用数据库认证：查询指定表并校验密码
 * @param {import('http').IncomingMessage} req
 * @param {'wl_users'|'hg_admin'} table - 用户表名
 * @param {boolean} [requireAdmin=false] - 是否校验 type='administrator'
 * @returns {Promise<Object|false>}
 */
async function authByTable(req, table, requireAdmin) {
  var creds = decodeToken(req)
  if (!creds) return false
  try {
    var sql = getSql()
    var rows = await sql`SELECT * FROM ${sql(table)} WHERE email = ${creds.email} LIMIT 1`
    if (!rows.length) return false
    var user = rows[0]
    if (requireAdmin && user.type !== 'administrator') return false
    return (await bcrypt.compare(creds.password, user.password)) ? user : false
  } catch (e) {
    console.error('Auth error:', e)
    return false
  }
}

/**
 * 获取管理员登录信息（根据认证模式自动选择数据源）
 * @param {import('http').IncomingMessage} [req] - 请求对象，用于读取认证模式
 * @returns {Promise<{ avatar: string; display_name: string }>}
 */
async function getAdminInfo(req) {
  try {
    var sql = getSql()
    if (getAuthMode(req) === 'hitorigoto') {
      var rows = await sql`SELECT email, avatar, display_name, username FROM hg_admin ORDER BY id LIMIT 1`
      if (!rows.length) return { avatar: '', display_name: 'Hitorigoto' }
      return {
        avatar: rows[0].avatar || libravatarUrl(rows[0].email),
        display_name: rows[0].display_name || rows[0].username || 'Hitorigoto'
      }
    }
    // Waline 模式
    var rows = await sql`SELECT email, avatar, display_name FROM wl_users WHERE type = 'administrator' LIMIT 1`
    if (!rows.length) return { avatar: '', display_name: 'Hitorigoto' }
    return {
      avatar: rows[0].avatar || libravatarUrl(rows[0].email),
      display_name: rows[0].display_name || 'Hitorigoto'
    }
  } catch (e) {
    return { avatar: '', display_name: 'Hitorigoto' }
  }
}

// ============================================
// Markdown 转换器（全局单例）
// ============================================

/** Showdown Converter 单例，支持表格/删除线/自动链接 */
const mdConverter = new showdown.Converter({
  strikethrough: true,
  tables: true,
  simplifiedAutoLink: true
})

// ============================================
// 头像工具
// ============================================

/**
 * 计算 Libravatar 头像 URL
 * @param {string} email - 用户邮箱
 * @param {number} [size=64] - 头像尺寸
 * @returns {string} Libravatar URL
 */
function libravatarUrl(email, size) {
  if (!size) size = 64
  var hash = email
    ? crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex')
    : 'default'
  return 'https://seccdn.libravatar.org/avatar/' + hash + '?d=mp&s=' + size
}

// ============================================
// HTTP 响应工具
// ============================================

/**
 * 设置标准 CORS 响应头
 * @param {import('http').ServerResponse} res - 响应对象
 * @returns {import('http').ServerResponse}
 */
function setCorsHeaders(res) {
  return res
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
}

/**
 * 处理 OPTIONS 预检请求
 * @param {import('http').ServerResponse} res - 响应对象
 * @returns {import('http').ServerResponse}
 */
function corsResponse(res) {
  return setCorsHeaders(res).status(204).end()
}

/**
 * 返回 JSON 响应（自动附带 CORS 头）
 * @param {import('http').ServerResponse} res - 响应对象
 * @param {*} data - 响应数据
 * @param {number} [status=200] - HTTP 状态码
 * @returns {import('http').ServerResponse}
 */
function jsonResponse(res, data, status = 200) {
  return setCorsHeaders(res)
    .setHeader('Content-Type', 'application/json')
    .status(status)
    .json(data)
}

/**
 * 返回错误 JSON 响应
 * @param {import('http').ServerResponse} res - 响应对象
 * @param {number} status - HTTP 状态码
 * @param {string} message - 错误信息
 * @returns {import('http').ServerResponse}
 */
function errorResponse(res, status, message) {
  return jsonResponse(res, { error: message }, status)
}

// ============================================
// 请求解析工具
// ============================================

/**
 * 安全解析请求体（支持 JSON 字符串和已解析对象）
 * @param {import('http').IncomingMessage} req - 请求对象
 * @returns {*} 解析后的 body 对象，解析失败返回空对象
 */
function getBody(req) {
  if (!req.body) return {}
  if (typeof req.body !== 'string') return req.body
  try {
    return JSON.parse(req.body)
  } catch (e) {
    console.error('Body parse error:', e.message)
    return {}
  }
}

// ============================================
// UA / IP 工具
// ============================================

/**
 * 解析 User-Agent 字符串，提取操作系统和浏览器
 * @param {string} ua - User-Agent 头部值
 * @returns {{ os: string; browser: string }}
 */
function parseUA(ua) {
  let os = 'Unknown', br = 'Unknown'

  if (/Windows NT/i.test(ua)) os = 'Windows'
  else if (/Mac OS X/i.test(ua)) os = 'macOS'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS'
  else if (/Linux/i.test(ua)) os = 'Linux'
  else if (/CrOS/i.test(ua)) os = 'ChromeOS'

  if (/Edg\//i.test(ua)) br = 'Edge'
  else if (/Chrome/i.test(ua) && !/Chromium|Edg/i.test(ua)) br = 'Chrome'
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) br = 'Safari'
  else if (/Firefox/i.test(ua)) br = 'Firefox'
  else if (/OPR|Opera/i.test(ua)) br = 'Opera'

  return { os, browser: br }
}

module.exports = {
  getSql,
  getAuthMode,
  adminAuth,
  mdConverter,
  getAdminInfo,
  corsResponse,
  jsonResponse,
  errorResponse,
  getBody,
  parseUA
}
