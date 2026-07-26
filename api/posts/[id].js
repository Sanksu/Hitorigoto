/**
 * @fileoverview 单条动态 API（查询 / 编辑 / 删除）
 * @route GET|PUT|DELETE /api/posts/:id
 */

const {
  getSql,
  adminAuth,
  getAdminInfo,
  corsResponse,
  errorResponse,
  jsonResponse,
  getBody,
  mdConverter
} = require('../_lib/db')

/**
 * 单条动态处理器
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return corsResponse(res)
  const id = parseInt(req.url.split('/').pop().split('?')[0], 10)
  if (!Number.isInteger(id) || id <= 0) return errorResponse(res, 400, 'Invalid post id')

  try {
    const sql = getSql()
    switch (req.method) {
      // 查询单条动态
      case 'GET': {
        const rows = await sql`SELECT * FROM hg_posts WHERE id = ${id}`
        if (!rows.length) return errorResponse(res, 404, 'Post not found')
        const admin = await getAdminInfo(req)
        return jsonResponse(res, { ...rows[0], avatar: admin.avatar })
      }

      // 编辑动态内容或状态
      case 'PUT': {
        const user = await adminAuth(req)
        if (!user) return errorResponse(res, 401, 'Unauthorized')
        const { content_md, status } = getBody(req)
        if (!content_md && !status) return errorResponse(res, 400, 'content_md 或 status 必填')
        if (status && !['published', 'hidden', 'pinned'].includes(status)) {
          return errorResponse(res, 400, 'status 必须为 published / hidden / pinned')
        }

        var rows
        if (content_md && status) {
          rows = await sql`
            UPDATE hg_posts SET content_md=${content_md}, content_html=${mdConverter.makeHtml(content_md)},
            status=${status}, "updatedAt"=CURRENT_TIMESTAMP WHERE id=${id} RETURNING *`
        } else if (content_md) {
          rows = await sql`
            UPDATE hg_posts SET content_md=${content_md}, content_html=${mdConverter.makeHtml(content_md)},
            "updatedAt"=CURRENT_TIMESTAMP WHERE id=${id} RETURNING *`
        } else {
          rows = await sql`
            UPDATE hg_posts SET status=${status}, "updatedAt"=CURRENT_TIMESTAMP WHERE id=${id} RETURNING *`
        }
        return rows.length ? jsonResponse(res, rows[0]) : errorResponse(res, 404, 'Post not found')
      }

      // 删除动态
      case 'DELETE': {
        if (!await adminAuth(req)) return errorResponse(res, 401, 'Unauthorized')
        const rows = await sql`DELETE FROM hg_posts WHERE id = ${id} RETURNING *`
        return rows.length ? jsonResponse(res, { success: true }) : errorResponse(res, 404, 'Post not found')
      }

      default: return errorResponse(res, 405, 'Method not allowed')
    }
  } catch (err) {
    console.error('Post [id] error:', err)
    return errorResponse(res, 500, err.message || 'Internal server error')
  }
}
