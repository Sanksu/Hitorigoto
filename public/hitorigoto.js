/**
 * @fileoverview Hitorigoto 前端嵌入式组件
 * @version 1.3.0
 *
 * 使用方式:
 *   <link rel="stylesheet" href="hitorigoto.css">
 *   <div id="hitorigoto"></div>
 *   <script src="hitorigoto.js"></script>
 *   <script>
 *     Hitorigoto.init({ serverURL: '//your-app.vercel.app', el: '#hitorigoto' })
 *   </script>
 *
 * 样式定制:
 *   // 方式一：CSS 变量覆盖
 *   .hg_main { --hg-accent: #1a73e8; --hg-card-radius: 8px; }
 *   // 方式二：init theme 参数
 *   Hitorigoto.init({ ..., theme: { accent: '#1a73e8', cardRadius: '8px' } })
 *   // 方式三：直接覆盖类
 *   .hg_main .hg_card { background: #f9f9f9; }
 *
 * 认证模式:
 *   Hitorigoto.init({ ..., authMode: 'waline' })    // 与 Waline 共用账号（默认）
 *   Hitorigoto.init({ ..., authMode: 'hitorigoto' }) // 独立 hg_admin 表
 */
;(function (global) {
  'use strict'

  // ============================================
  // 工具函数
  // ============================================

  /** 数字补零: 5 → '05' */
  function pad(n) {
    return n < 10 ? '0' + n : '' + n
  }

  /** camelCase → kebab-case */
  function toKebab(str) {
    return str.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase() })
  }

  /** 简写 document.getElementById */
  function $(id) {
    return document.getElementById(id)
  }

  /** 简写 document.querySelector */
  function qs(sel, ctx) {
    return (ctx || document).querySelector(sel)
  }

  // ============================================
  // 国际化文本
  // ============================================

  const I18N = {
    zh: { more: '加载更多...', loading: '加载中...', empty: '还没有动态~', edited: '修改于 ', login: '登录', logout: '退出', publish: '发布', placeholder: '说点什么...', logging: '登录中...', publishing: '发布中...', loadError: '加载失败，请稍后重试' },
    en: { more: 'Load more...', loading: 'Loading...', empty: 'No posts yet~', edited: 'edited ', login: 'Login', logout: 'Logout', publish: 'Publish', placeholder: 'Write something...', logging: 'Logging in...', publishing: 'Publishing...', loadError: 'Failed to load, please try again' }
  }

  // ============================================
  // 常量
  // ============================================

 var DEFAULT_AVATAR = 'https://seccdn.libravatar.org/avatar/default?d=mp&s=64'

  /**
   * Hitorigoto 动态组件实例
   */
  function HitorigotoInstance(config) {
    this.cfg = config
    this.uid = 'hg_' + Math.random().toString(36).slice(2, 10)

    this.cfg.el = this.cfg.el || '#hitorigoto'
    this.cfg.serverURL = (this.cfg.serverURL || '').replace(/\/$/, '')
    this.cfg.pageSize = this.cfg.pageSize || 5
    this.cfg.lang = this.cfg.lang || 'zh'
    this.cfg.name = this.cfg.name || 'Hitorigoto'
    this.cfg.authMode = this.cfg.authMode || 'waline'
    this.cfg.theme = this.cfg.theme || null
    this.t = I18N[this.cfg.lang] || I18N.zh

    try { localStorage.setItem('hg_auth_mode', this.cfg.authMode) } catch (e) {}

    this.page = 0
    this.total = 0
    this.loading = false
    this.hasMore = true
    this.token = null

    this._checkLogin()

    this._loadHLJS()
    this._injectTheme()
    this._buildDOM()
    this._fetchPosts(true)
  }

  /** 检查 localStorage 中的登录状态 */
  HitorigotoInstance.prototype._checkLogin = function () {
    var t
    try { t = localStorage.getItem('hg_admin_token') || sessionStorage.getItem('hg_admin_token') } catch (e) {}
    this.token = t || null
  }

  /** 注入自定义主题变量 */
  HitorigotoInstance.prototype._injectTheme = function () {
    var theme = this.cfg.theme
    if (!theme || typeof theme !== 'object') return
    var uid = this.uid
    var css = '#' + uid + '.hg_main {\n'
    for (var key in theme) {
      if (Object.prototype.hasOwnProperty.call(theme, key)) {
        css += '  --hg-' + toKebab(key) + ': ' + theme[key] + ';\n'
      }
    }
    css += '}'
    var styleEl = document.createElement('style')
    styleEl.textContent = css
    document.head.appendChild(styleEl)
  }

  /** 动态加载 highlight.js */
  HitorigotoInstance.prototype._loadHLJS = function () {
    if (window.hljs || $('hg-hljs')) return
    var script = document.createElement('script')
    script.id = 'hg-hljs'
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js'
    script.onload = function () {
      var codes = document.querySelectorAll('.hg_card_body pre code')
      for (var i = 0; i < codes.length; i++) {
        window.hljs.highlightElement(codes[i])
      }
    }
    document.head.appendChild(script)
  }

  /** 构建 HTML 结构骨架 */
  HitorigotoInstance.prototype._buildDOM = function () {
    var uid = this.uid, t = this.t
    var container = document.querySelector(this.cfg.el)
    if (!container) return

    container.innerHTML =
      '<div id="' + uid + '" class="hg_main">' +
        '<div class="hg_toolbar" id="hg_tool_' + uid + '"></div>' +
        '<div id="hg_timeline_' + uid + '">' +
          '<ul class="hg_timeline" id="hg_list_' + uid + '"></ul>' +
        '</div>' +
        '<div class="hg_loadmore" id="hg_more_' + uid + '" style="display:none">' +
          '<button class="hg_btn" onclick="Hitorigoto.instances[\'' + uid + '\']._loadMore()">' + t.more + '</button>' +
        '</div>' +
        '<div class="hg_login_section" id="hg_login_sec_' + uid + '" style="display:none">' +
          '<button class="hg_btn" id="hg_login_toggle_' + uid + '" onclick="Hitorigoto.instances[\'' + uid + '\']._toggleLoginForm()">' + t.login + '</button>' +
          '<div class="hg_login_form" id="hg_login_form_' + uid + '" style="display:none">' +
            '<input class="hg_login_input" id="hg_email_' + uid + '" type="email" placeholder="Email" autocomplete="email">' +
            '<input class="hg_login_input" id="hg_pass_' + uid + '" type="password" placeholder="Password" autocomplete="current-password">' +
            '<button class="hg_btn" id="hg_login_btn_' + uid + '" onclick="Hitorigoto.instances[\'' + uid + '\']._doLogin()">' + t.login + '</button>' +
            '<p class="hg_login_error" id="hg_login_err_' + uid + '"></p>' +
          '</div>' +
        '</div>' +
        '<div class="hg_loading" id="hg_load_' + uid + '">' +
          '<div class="hg_dots"><span></span><span></span><span></span></div>' +
          '<p style="margin-top:8px">' + t.loading + '</p>' +
        '</div>' +
        '<div class="hg_empty" id="hg_none_' + uid + '" style="display:none">' + t.empty + '</div>' +
      '</div>'

    this._renderToolbar()
  }

  /** 渲染顶部工具栏（登录后显示发布框） */
  HitorigotoInstance.prototype._renderToolbar = function () {
    var uid = this.uid, t = this.t
    var el = $('hg_tool_' + uid)
    if (!el) return

    // 显示/隐藏底部登录区
    var loginSec = $('hg_login_sec_' + uid)
    if (loginSec) {
      loginSec.style.display = this.token ? 'none' : 'block'
      // 重置登录表单状态
      var form = $('hg_login_form_' + uid)
      if (form) form.style.display = 'none'
      var toggleBtn = $('hg_login_toggle_' + uid)
      if (toggleBtn) toggleBtn.textContent = t.login
    }

    if (this.token) {
      var userName = localStorage.getItem('hg_admin_name') || this.displayName || this.cfg.name
      el.innerHTML =
        '<div class="hg_user_bar">' +
          '<span class="hg_user_name">' + userName + '</span>' +
          '<button class="hg_btn_sm" onclick="Hitorigoto.instances[\'' + uid + '\']._doLogout()">' + t.logout + '</button>' +
        '</div>' +
        '<div class="hg_publish_box">' +
          '<textarea class="hg_publish_input" id="hg_pub_' + uid + '" rows="3" placeholder="' + t.placeholder + '"></textarea>' +
          '<div class="hg_publish_actions">' +
            '<button class="hg_btn" onclick="Hitorigoto.instances[\'' + uid + '\']._doPublish()">' + t.publish + '</button>' +
          '</div>' +
        '</div>'
    } else {
      el.innerHTML = ''
    }
  }

  /** 切换登录表单展开/收起 */
  HitorigotoInstance.prototype._toggleLoginForm = function () {
    var form = $('hg_login_form_' + this.uid)
    if (!form) return
    form.style.display = form.style.display === 'none' ? 'flex' : 'none'
  }

  /** 执行登录 */
  HitorigotoInstance.prototype._doLogin = function () {
    var self = this, uid = this.uid
    var email = $('hg_email_' + uid).value.trim()
    var pass = $('hg_pass_' + uid).value.trim()
    var btn = $('hg_login_btn_' + uid)
    var errEl = $('hg_login_err_' + uid)
    if (!email || !pass) { errEl.textContent = 'Email / password required'; return }
    errEl.textContent = ''
    btn.disabled = true
    btn.textContent = this.t.logging

    fetch(this.cfg.serverURL + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: pass, authMode: this.cfg.authMode })
    })
      .then(function (r) { return r.json() })
      .then(function (data) {
        if (data.token) {
          try { localStorage.setItem('hg_admin_token', data.token); localStorage.setItem('hg_admin_name', data.display_name || '') } catch (e) {}
          self.token = data.token
          self._renderToolbar()
          self._fetchPosts(true)
        } else {
          errEl.textContent = data.error || 'Login failed'
          btn.disabled = false
          btn.textContent = self.t.login
        }
      })
      .catch(function () {
        errEl.textContent = 'Network error'
        btn.disabled = false
        btn.textContent = self.t.login
      })
  }

  /** 执行退出 */
  HitorigotoInstance.prototype._doLogout = function () {
    try {
      localStorage.removeItem('hg_admin_token')
      localStorage.removeItem('hg_admin_name')
      sessionStorage.removeItem('hg_admin_token')
    } catch (e) {}
    this.token = null
    this._renderToolbar()
  }

  /** 执行发布 */
  HitorigotoInstance.prototype._doPublish = function () {
    var self = this, uid = this.uid
    var input = $('hg_pub_' + uid)
    var content = input ? input.value.trim() : ''
    if (!content) return

    var btn = qs('.hg_publish_actions .hg_btn', $('hg_tool_' + uid))
    if (btn) { btn.disabled = true; btn.textContent = this.t.publishing }

    fetch(this.cfg.serverURL + '/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.token },
      body: JSON.stringify({ content_md: content })
    })
      .then(function (r) {
        if (r.status === 401) { self._doLogout(); throw new Error('Unauthorized') }
        return r.json()
      })
      .then(function () {
        if (input) input.value = ''
        if (btn) { btn.disabled = false; btn.textContent = self.t.publish }
        self._fetchPosts(true)
      })
      .catch(function () {
        if (btn) { btn.disabled = false; btn.textContent = self.t.publish }
      })
  }

  /** 从服务端获取动态列表 */
  HitorigotoInstance.prototype._fetchPosts = function (isFirst) {
    var self = this
    if (this.loading) return
    this.loading = true

    var uid = this.uid
    if (isFirst) {
      this.page = 0
      this.hasMore = true
      this.total = 0
      $('hg_list_' + uid).innerHTML = ''
      $('hg_more_' + uid).style.display = 'none'
      $('hg_none_' + uid).style.display = 'none'
      $('hg_load_' + uid).style.display = 'block'
    }

    var url = this.cfg.serverURL + '/api/posts?page=' + this.page + '&pageSize=' + this.cfg.pageSize + '&authMode=' + this.cfg.authMode

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error(res.status)
        return res.json()
      })
      .then(function (data) {
        $('hg_load_' + uid).style.display = 'none'
        if (data.posts && data.posts.length) {
          if (data.display_name) {
            self.displayName = data.display_name
          }
          self._renderPosts(data.posts, isFirst)
          self.total = data.total || 0
          self.hasMore = (self.page + 1) * self.cfg.pageSize < self.total
          $('hg_more_' + uid).style.display = self.hasMore ? 'block' : 'none'
          // Refresh toolbar to update user name
          if (isFirst) self._renderToolbar()
        } else if (isFirst) {
          $('hg_none_' + uid).style.display = 'block'
        }
        self.loading = false
      })
      .catch(function () {
        $('hg_load_' + uid).style.display = 'none'
        if (isFirst) {
          $('hg_none_' + uid).style.display = 'block'
        } else {
          $('hg_load_' + uid).innerHTML = '<p style="color:#e74c3c">' + self.t.loadError + '</p>'
          $('hg_load_' + uid).style.display = 'block'
        }
        self.loading = false
      })
  }

  /** 加载下一页 */
  HitorigotoInstance.prototype._loadMore = function () {
    if (!this.loading && this.hasMore) {
      this.page++
      this._fetchPosts(false)
    }
  }

  /** 动态切换语言 */
  HitorigotoInstance.prototype.setLang = function (lang) {
    if (!I18N[lang]) return
    this.cfg.lang = lang
    this.t = I18N[lang]
    this._renderToolbar()
    this._fetchPosts(true)
  }

  /** 渲染动态列表到 DOM */
  HitorigotoInstance.prototype._renderPosts = function (posts, replace) {
    var self = this
    var uid = this.uid
    var listEl = $('hg_list_' + uid)
    var lang = this.cfg.lang
    var displayName = this.displayName || this.cfg.name || 'Hitorigoto'
    var html = ''

    posts.forEach(function (post) {
      var created = new Date(post.createdAt)
      var day = created.getDate()
      var month = created.getMonth() + 1
      var timeStr = created.getFullYear() + '/' + pad(month) + '/' + pad(day) + ' ' + pad(created.getHours()) + ':' + pad(created.getMinutes())

      var editedStr = ''
      if (post.updatedAt && post.createdAt !== post.updatedAt) {
        var updated = new Date(post.updatedAt)
        editedStr = self.t.edited + updated.getFullYear() + '/' + pad(updated.getMonth() + 1) + '/' + pad(updated.getDate()) + ' ' + pad(updated.getHours()) + ':' + pad(updated.getMinutes())
      }

      var footerParts = []
      if (post.os) footerParts.push(post.os)
      if (post.browser) footerParts.push(post.browser)
      var footerStr = footerParts.join(' · ')
      if (editedStr) footerStr = footerStr ? footerStr + ' · ' + editedStr : editedStr

      html +=
        '<li class="hg_post">' +
          '<div class="hg_card">' +
            '<div class="hg_card_header">' +
              '<img class="hg_card_avatar" src="' + (post.avatar || DEFAULT_AVATAR) + '" width="44" height="44" onerror="this.style.display=\'none\'">' +
              '<div class="hg_card_info">' +
                '<span class="hg_card_name">' + displayName + '</span>' +
                '<span class="hg_card_time">' + timeStr + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="hg_card_body hg_content">' +
              (post.content_html || '') +
            '</div>' +
            (footerStr ? '<div class="hg_card_footer">' + footerStr + '</div>' : '') +
          '</div>' +
        '</li>'
    })

    if (replace) {
      listEl.innerHTML = html
    } else {
      listEl.insertAdjacentHTML('beforeend', html)
    }

    if (window.hljs) {
      var codes = listEl.querySelectorAll('pre code')
      for (var i = 0; i < codes.length; i++) {
        window.hljs.highlightElement(codes[i])
      }
    }
  }

  // ============================================
  // 公开 API
  // ============================================

  var instances = {}

  function init(options) {
    if (!options || !options.serverURL) {
      console.error('[Hitorigoto] serverURL 必填')
      return null
    }
    var instance = new HitorigotoInstance(options)
    instances[instance.uid] = instance
    return instance
  }

  global.Hitorigoto = { init: init, instances: instances }
})(typeof window !== 'undefined' ? window : this)
