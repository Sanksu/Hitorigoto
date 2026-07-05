-- ============================================
-- ひとりごと (Hitorigoto) 数据库表结构
-- ============================================

-- 动态表
CREATE SEQUENCE IF NOT EXISTS hg_posts_seq;
CREATE TABLE IF NOT EXISTS hg_posts (
  id int check (id > 0) NOT NULL DEFAULT NEXTVAL ('hg_posts_seq'),
  content_md text NOT NULL DEFAULT '',
  content_html text NOT NULL DEFAULT '',
  os varchar(100) DEFAULT '',
  browser varchar(100) DEFAULT '',
  "createdAt" timestamp(0) without time zone NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(0) without time zone NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_hg_posts_createdAt ON hg_posts("createdAt" DESC);

-- ============================================
-- 管理员表（独立模式使用）
-- 当请求参数 authMode=hitorigoto 时，使用此表
-- 当请求参数 authMode=waline（默认）时，使用 Waline 的 wl_users 表
-- ============================================
CREATE SEQUENCE IF NOT EXISTS hg_admin_seq;
CREATE TABLE IF NOT EXISTS hg_admin (
  id int check (id > 0) NOT NULL DEFAULT NEXTVAL ('hg_admin_seq'),
  username varchar(100) NOT NULL DEFAULT '',
  email varchar(254) NOT NULL,
  password varchar(60) NOT NULL,
  display_name varchar(100) NOT NULL DEFAULT '',
  avatar varchar(500) NOT NULL DEFAULT '',
  "createdAt" timestamp(0) without time zone NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hg_admin_email ON hg_admin(email);
