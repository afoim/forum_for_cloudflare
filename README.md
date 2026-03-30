# AcoFork Forum

> [!CAUTION]
> 本项目完全使用AI开发，作者完全不懂网络安全，也不懂后端开发，项目源码可能包含非常多的恶性漏洞，包括但不限于越权访问，信息伪造，XSS攻击，CSRF攻击等情况。若您原封不动直接部署，请确保该项目不作为生产环境使用，并且时刻做好自己的数据一夜清空的准备。

一个基于 Cloudflare Workers + D1 数据库的论坛后端 API 项目。

## 功能特性

- 用户注册/登录/邮箱验证
- JWT 认证 + 会话管理
- 帖子发布/编辑/删除
- 嵌套评论系统
- 点赞功能
- 分类管理
- 图片上传 (S3 兼容存储)
- Markdown 支持
- 2FA (TOTP) 双因素认证
- Cloudflare Turnstile 人机验证
- 管理员后台相关 API

## 技术栈

- **运行时**: Cloudflare Workers (TypeScript)
- **数据库**: Cloudflare D1 (SQLite)
- **存储**: S3 兼容对象存储 (如 Cloudflare R2)
- **认证**: JWT + 会话令牌
- **测试**: Vitest + `@cloudflare/vitest-pool-workers`

## 开发与部署

### 1. 前置要求

- Node.js 18+
- Cloudflare 账号
- Wrangler CLI (`npm install -g wrangler`)

### 2. 克隆并安装依赖

```bash
git clone https://github.com/afoim/forum_for_cloudflare.git
cd forum_for_cloudflare
npm install
```

### 3. 创建 D1 数据库

```bash
wrangler d1 create forum-db
```

记录返回的 `database_id`，更新 `wrangler.jsonc` 中的配置：

```json
"d1_databases": [
  {
    "binding": "forum_db",
    "database_name": "forum-db",
    "database_id": "your-database-id"
  }
]
```

### 4. 初始化数据库

```bash
wrangler d1 execute forum-db --file=./schema.sql
```

### 5. 配置环境变量

创建 `.dev.vars` 文件（本地开发）或通过 `wrangler secret` 设置（生产环境）：

```bash
# .dev.vars 示例
JWT_SECRET=your-very-long-random-secret-key-at-least-32-characters
TURNSTILE_SITE_KEY=your-cloudflare-turnstile-site-key
TURNSTILE_SECRET_KEY=your-cloudflare-turnstile-secret-key

# S3 存储 (可选，用于图片上传)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=auto
AWS_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
AWS_BUCKET=your-bucket-name
```

### 6. 配置 SMTP (可选)

如需邮箱验证功能，还需配置 SMTP 相关变量：

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=noreply@example.com
```

### 7. 本地开发

```bash
npm run dev
```

默认仅启动 Worker 本地开发服务，不再包含任何前端静态页面构建或托管。

### 8. 部署到 Cloudflare

```bash
npm run deploy
```

当前仓库仅负责 `/api/*` 后端能力；非 `/api/*` 路由应由上层网关、反向代理或其他站点配置接管。

## 配置 Cloudflare Turnstile

1. 访问 [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) 获取 Site Key 和 Secret Key
2. 将 Site Key 设置为环境变量 `TURNSTILE_SITE_KEY`
3. 将 Secret Key 设置为环境变量 `TURNSTILE_SECRET_KEY`
4. 通过对应管理 API 启用或调整相关配置

## 目录结构

```
├── src/
│   ├── index.ts        # Worker API 入口
│   ├── security.ts     # 认证/安全模块
│   ├── s3.ts           # S3 存储模块
│   ├── smtp.ts         # 邮件发送模块
│   └── identicon.ts    # 默认头像生成
├── migrations/         # 数据库迁移文件
├── schema.sql          # 数据库初始化脚本
├── test/               # 后端测试
├── wrangler.jsonc      # Cloudflare Workers 配置
└── package.json
```

## 默认账号

初始化数据库后，默认管理员账号：
- 邮箱: `admin@example.com`
- 密码: `password123`

**请务必在首次登录后立即修改密码！**
