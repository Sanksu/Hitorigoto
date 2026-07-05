/**
 * @fileoverview 动态列表 API（分页查询 / 发布新动态）
 * @route GET|POST /api/posts
 */

const {
  getSql,
  adminAuth,
  getAdminInfo,
  corsResponse,
  errorResponse,
  jsonResponse,
  getBody,
  parseUA,
  mdConverter
} = require('../_lib/db')

/**
 * 动态列表处理器
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return corsResponse(res)
  const query = new URLSearchParams(req.url.split('?')[1] || '')
  const page = Math.max(0, parseInt(query.get('page'), 10) || 0)
  const pageSize = Math.min(100, Math.max(1, parseInt(query.get('pageSize'), 10) || 10))

  try {
    const sql = getSql()
    switch (req.method) {
      // 分页查询动态列表
      case 'GET': {
        const [posts, count, admin] = await Promise.all([
          sql`SELECT * FROM hg_posts ORDER BY "createdAt" DESC LIMIT ${pageSize} OFFSET ${page * pageSize}`,
          sql`SELECT COUNT(*) as total FROM hg_posts`,
          getAdminInfo(req)
        ])
        const resultPosts = posts.map(p => ({ ...p, avatar: admin.avatar }))
        return jsonResponse(res, {
          posts: resultPosts,
          display_name: admin.display_name,
          total: parseInt(count[0].total),
          page,
          pageSize
        })
      }

      // 发布新动态
      case 'POST': {
        const user = await adminAuth(req)
        if (!user) return errorResponse(res, 401, 'Unauthorized')
        const { content_md } = getBody(req)
        if (!content_md) return errorResponse(res, 400, 'content_md required')
        const ua = parseUA(req.headers['user-agent'] || '')
        const now = new Date()
        const rows = await sql`
          INSERT INTO hg_posts (content_md, content_html, os, browser, "createdAt")
          VALUES (${content_md}, ${mdConverter.makeHtml(content_md)}, ${ua.os}, ${ua.browser}, ${now.toISOString()})
          RETURNING *`
        return jsonResponse(res, rows[0], 201)
      }

      default: return errorResponse(res, 405, 'Method not allowed')
    }
  } catch (err) {
    console.error('Posts error:', err)
    return errorResponse(res, 500, err.message || 'Internal server error')
  }
}
