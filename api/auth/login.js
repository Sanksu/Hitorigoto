/**
 * @fileoverview 管理员登录 API
 * @route POST /api/auth/login
 *
 * 根据请求中的 authMode 参数选择认证方式:
 *   waline     → 查询 wl_users 表（与 Waline 共用账号）
 *   hitorigoto → 查询 hg_admin 表（独立账号）
 *
 * Token 格式: base64(email:password)，无状态，适合 Serverless
 */

const {
  getSql,
  getAuthMode,
  corsResponse,
  errorResponse,
  jsonResponse,
  getBody
} = require('../_lib/db')
const bcrypt = require('bcryptjs')

/**
 * 登录处理器
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return corsResponse(res)
  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed')

  try {
    const { email, password, authMode } = getBody(req)
    if (!email || !password) return errorResponse(res, 400, '邮箱和密码不能为空')

    const sql = getSql()

    // 从请求体读取认证模式，未指定时从请求头/查询参数获取
    var actualMode = authMode || getAuthMode(req)

    if (actualMode === 'hitorigoto') {
      // 独立模式：查询 hg_admin 表
      const users = await sql`SELECT * FROM hg_admin WHERE email = ${email} LIMIT 1`
      if (!users.length) return errorResponse(res, 401, '邮箱或密码错误')
      const user = users[0]
      if (!await bcrypt.compare(password, user.password)) return errorResponse(res, 401, '邮箱或密码错误')
      const token = Buffer.from(email + ':' + password).toString('base64')
      return jsonResponse(res, {
        token,
        display_name: user.display_name || user.username,
        email: user.email
      })
    }

    // Waline 模式：查询 wl_users 表（原有逻辑）
    const users = await sql`SELECT * FROM wl_users WHERE email = ${email} LIMIT 1`
    if (!users.length) return errorResponse(res, 401, '邮箱或密码错误')
    const user = users[0]
    if (user.type !== 'administrator') return errorResponse(res, 403, '无管理员权限')
    if (!await bcrypt.compare(password, user.password)) return errorResponse(res, 401, '邮箱或密码错误')
    const token = Buffer.from(email + ':' + password).toString('base64')
    return jsonResponse(res, {
      token,
      display_name: user.display_name,
      email: user.email
    })
  } catch (err) {
    console.error('Auth error:', err)
    return errorResponse(res, 500, err.message || '内部错误')
  }
}
