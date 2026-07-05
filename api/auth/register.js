/**
 * @fileoverview 管理员注册 API（仅 hitorigoto 模式使用）
 * @route POST /api/auth/register
 *
 * 仅在 hg_admin 表中无管理员记录时可用
 * waline 模式下不可用（应使用 Waline 管理后台）
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
 * 注册处理器
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return corsResponse(res)
  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed')

  if (getAuthMode(req) !== 'hitorigoto') {
    return errorResponse(res, 400, '仅 hitorigoto 模式支持注册，waline 模式请使用 Waline 管理后台')
  }

  try {
    const sql = getSql()

    // 检查是否已有管理员
    const existing = await sql`SELECT COUNT(*) as cnt FROM hg_admin`
    if (parseInt(existing[0].cnt) > 0) {
      return errorResponse(res, 400, '管理员已存在，无法重复注册')
    }

    const { username, email, password, display_name } = getBody(req)
    if (!email || !password) return errorResponse(res, 400, '邮箱和密码不能为空')
    if (password.length < 6) return errorResponse(res, 400, '密码至少 6 位')

    const hashed = await bcrypt.hash(password, 10)
    const rows = await sql`
      INSERT INTO hg_admin (username, email, password, display_name)
      VALUES (${username || ''}, ${email}, ${hashed}, ${display_name || username || email})
      RETURNING id, username, email, display_name, "createdAt"`
    const user = rows[0]
    const token = Buffer.from(email + ':' + password).toString('base64')

    return jsonResponse(res, {
      token,
      display_name: user.display_name,
      email: user.email
    }, 201)
  } catch (err) {
    // 唯一键冲突（重复邮箱）
    if (err.code === '23505') {
      return errorResponse(res, 409, '该邮箱已被注册')
    }
    console.error('Register error:', err)
    return errorResponse(res, 500, err.message || '内部错误')
  }
}
