import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import worker from '../src';
import { Security } from '../src/security';

async function sha256(text: string): Promise<string> {
	const input = new TextEncoder().encode(text);
	const digest = await crypto.subtle.digest('SHA-256', input);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

async function resetTestData() {
	for (const statement of [
		'DELETE FROM audit_logs',
		'DELETE FROM nonces',
		'DELETE FROM comment_likes',
		'DELETE FROM likes',
		'DELETE FROM comments',
		'DELETE FROM posts',
		'DELETE FROM sessions',
		'DELETE FROM users',
		'DELETE FROM settings'
	]) {
		await env.forum_db.prepare(statement).run();
	}
	await env.forum_db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('turnstile_enabled', '0')").run();
}

async function createAdminAuth() {
	const passwordHash = await sha256('password123');
	const adminInsert = await env.forum_db
		.prepare("INSERT INTO users (email, username, password, role, verified) VALUES (?, ?, ?, 'admin', 1)")
		.bind('admin@example.com', 'admin', passwordHash)
		.run();
	const adminId = Number(adminInsert.meta.last_row_id);
	const security = new Security(env);
	const { token, jti, expiresAt } = await security.generateToken({
		id: adminId,
		role: 'admin',
		email: 'admin@example.com'
	});
	await env.forum_db.prepare('INSERT INTO sessions (jti, user_id, expires_at) VALUES (?, ?, ?)').bind(jti, adminId, expiresAt).run();
	return { token, adminId };
}

describe('Worker API smoke tests', () => {
	beforeAll(async () => {
		(env as any).JWT_SECRET = '0123456789abcdef0123456789abcdef';

		await env.forum_db.prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)').run();
		await env.forum_db.prepare("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, username TEXT NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'user', verified INTEGER DEFAULT 1, avatar_url TEXT, email_notifications INTEGER DEFAULT 1, article_notifications INTEGER DEFAULT 0)").run();
		await env.forum_db.prepare("CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, author_id INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, category_id INTEGER, is_pinned INTEGER DEFAULT 0, view_count INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (author_id) REFERENCES users(id))").run();
		await env.forum_db.prepare('CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, parent_id INTEGER, author_id INTEGER NOT NULL, content TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (post_id) REFERENCES posts(id), FOREIGN KEY (parent_id) REFERENCES comments(id), FOREIGN KEY (author_id) REFERENCES users(id))').run();
		await env.forum_db.prepare('CREATE TABLE IF NOT EXISTS likes (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(post_id, user_id), FOREIGN KEY (post_id) REFERENCES posts(id), FOREIGN KEY (user_id) REFERENCES users(id))').run();
		await env.forum_db.prepare('CREATE TABLE IF NOT EXISTS comment_likes (id INTEGER PRIMARY KEY AUTOINCREMENT, comment_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(comment_id, user_id), FOREIGN KEY (comment_id) REFERENCES comments(id), FOREIGN KEY (user_id) REFERENCES users(id))').run();
		await env.forum_db.prepare('CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)').run();
		await env.forum_db.prepare('CREATE TABLE IF NOT EXISTS sessions (jti TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))').run();
		await env.forum_db.prepare('CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)').run();
		await env.forum_db.prepare('CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT NOT NULL, resource_type TEXT, resource_id TEXT, details TEXT, ip_address TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)').run();

		await env.forum_db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('turnstile_enabled', '0')").run();
	}, 30000);

	it('GET /api/config returns expected shape with branding defaults', async () => {
		await resetTestData();
		const request = new Request('http://example.com/api/config', { method: 'GET' });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const data = await response.json<any>();
		expect(typeof data.turnstile_enabled).toBe('boolean');
		expect(typeof data.turnstile_site_key).toBe('string');
		expect(data.site_name).toBe('D1 Forum');
		expect(data.site_avatar_url).toBe('');
		expect(data.home_intro_markdown).toContain('forum_for_cloudflare');
		expect(data.site_footer_markdown).toBe('');
	});

	it('admin settings should persist branding fields and keep string types', async () => {
		await resetTestData();
		const { token } = await createAdminAuth();
		const now = Math.floor(Date.now() / 1000).toString();
		const nonce = crypto.randomUUID();
		const saveRequest = new Request('http://example.com/api/admin/settings', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
				'X-Timestamp': now,
				'X-Nonce': nonce
			},
			body: JSON.stringify({
				site_name: 'Cloud Forum',
				site_avatar_url: 'https://cdn.example.com/avatar.png',
				home_intro_markdown: '# 首页说明\n\n欢迎来到论坛。',
				site_footer_markdown: '[页脚链接](https://example.com)',
				turnstile_enabled: true,
				session_ttl_days: 14
			})
		});
		const saveCtx = createExecutionContext();
		const saveResponse = await worker.fetch(saveRequest, env, saveCtx);
		await waitOnExecutionContext(saveCtx);
		expect(saveResponse.status).toBe(200);

		const getRequest = new Request('http://example.com/api/admin/settings', {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`
			}
		});
		const getCtx = createExecutionContext();
		const getResponse = await worker.fetch(getRequest, env, getCtx);
		await waitOnExecutionContext(getCtx);
		expect(getResponse.status).toBe(200);
		const data = await getResponse.json<any>();
		expect(data.site_name).toBe('Cloud Forum');
		expect(data.site_avatar_url).toBe('https://cdn.example.com/avatar.png');
		expect(data.home_intro_markdown).toBe('# 首页说明\n\n欢迎来到论坛。');
		expect(data.site_footer_markdown).toBe('[页脚链接](https://example.com)');
		expect(typeof data.site_name).toBe('string');
		expect(typeof data.site_avatar_url).toBe('string');
		expect(typeof data.home_intro_markdown).toBe('string');
		expect(typeof data.site_footer_markdown).toBe('string');
		expect(data.turnstile_enabled).toBe(true);
		expect(data.session_ttl_days).toBe(14);
	});

	it('admin settings should reject overly long markdown fields', async () => {
		await resetTestData();
		const { token } = await createAdminAuth();
		const now = Math.floor(Date.now() / 1000).toString();
		const nonce = crypto.randomUUID();
		const request = new Request('http://example.com/api/admin/settings', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
				'X-Timestamp': now,
				'X-Nonce': nonce
			},
			body: JSON.stringify({
				home_intro_markdown: 'a'.repeat(5001)
			})
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		await expect(response.json<any>()).resolves.toMatchObject({ error: '首页说明不能超过 5000 个字符' });
	});

	it('non-admin should be rejected from admin settings', async () => {
		await resetTestData();
		const passwordHash = await sha256('password123');
		const userInsert = await env.forum_db
			.prepare("INSERT INTO users (email, username, password, role, verified) VALUES (?, ?, ?, 'user', 1)")
			.bind('user@example.com', 'user', passwordHash)
			.run();
		const userId = Number(userInsert.meta.last_row_id);
		const security = new Security(env);
		const { token, jti, expiresAt } = await security.generateToken({
			id: userId,
			role: 'user',
			email: 'user@example.com'
		});
		await env.forum_db.prepare('INSERT INTO sessions (jti, user_id, expires_at) VALUES (?, ?, ?)').bind(jti, userId, expiresAt).run();

		const request = new Request('http://example.com/api/admin/settings', {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`
			}
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(403);
	});

	it('html pages should inject dynamic title and favicon from branding config', async () => {
		await resetTestData();
		await env.forum_db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('site_name', '品牌论坛')").run();
		await env.forum_db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('site_avatar_url', 'https://cdn.example.com/site.png')").run();
		(env as any).ASSETS = {
			fetch: async (request: Request) => {
				const url = new URL(request.url);
				if (url.pathname === '/login.html' || url.pathname === '/favicon.ico') {
					return new Response(
						'<!doctype html><html><head><title>默认标题</title><link rel="icon" href="/favicon.ico" /></head><body><div id="root"></div></body></html>',
						{ headers: { 'Content-Type': 'text/html; charset=utf-8' } }
					);
				}
				return new Response('Not Found', { status: 404 });
			}
		};
		const request = new Request('http://example.com/login', { method: 'GET' });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const html = await response.text();
		expect(html).toContain('<title>登录 - 品牌论坛</title>');
		expect(html).toContain('rel="icon"');
		expect(html).toContain('href="https://cdn.example.com/site.png"');
	});

	it('POST /api/posts/:id/comments should accept markdown content and GET should return it', async () => {
		await resetTestData();

		const passwordHash = await sha256('password123');
		const userInsert = await env.forum_db
			.prepare("INSERT INTO users (email, username, password, role, verified) VALUES (?, ?, ?, 'user', 1)")
			.bind('md-author@example.com', 'md-author', passwordHash)
			.run();
		const userId = Number(userInsert.meta.last_row_id);

		const postInsert = await env.forum_db
			.prepare('INSERT INTO posts (author_id, title, content) VALUES (?, ?, ?)')
			.bind(userId, 'markdown post', 'post content')
			.run();
		const postId = Number(postInsert.meta.last_row_id);

		const security = new Security(env);
		const { token, jti, expiresAt } = await security.generateToken({
			id: userId,
			role: 'user',
			email: 'md-author@example.com'
		});
		await env.forum_db.prepare('INSERT INTO sessions (jti, user_id, expires_at) VALUES (?, ?, ?)').bind(jti, userId, expiresAt).run();

		const markdown = '**粗体**\n\n- 列表项\n\n`code`';
		const now = Math.floor(Date.now() / 1000).toString();
		const nonce = crypto.randomUUID();
		const createReq = new Request(`http://example.com/api/posts/${postId}/comments`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
				'X-Timestamp': now,
				'X-Nonce': nonce
			},
			body: JSON.stringify({ content: markdown, parent_id: null })
		});
		const createCtx = createExecutionContext();
		const createRes = await worker.fetch(createReq, env, createCtx);
		await waitOnExecutionContext(createCtx);
		expect(createRes.status).toBe(201);

		const listReq = new Request(`http://example.com/api/posts/${postId}/comments`, { method: 'GET' });
		const listCtx = createExecutionContext();
		const listRes = await worker.fetch(listReq, env, listCtx);
		await waitOnExecutionContext(listCtx);
		expect(listRes.status).toBe(200);

		const comments = await listRes.json<any[]>();
		expect(Array.isArray(comments)).toBe(true);
		expect(comments.length).toBe(1);
		expect(comments[0]?.content).toContain('**粗体**');
		expect(comments[0]?.content).toContain('`code`');
	}, 20000);

	it('POST /api/user/delete should remove user with replied comments and sessions', async () => {
		await resetTestData();

		const password = 'password123';
		const passwordHash = await sha256(password);

		const targetInsert = await env.forum_db
			.prepare("INSERT INTO users (email, username, password, role, verified) VALUES (?, ?, ?, 'user', 1)")
			.bind('target@example.com', 'target', passwordHash)
			.run();
		const targetId = Number(targetInsert.meta.last_row_id);

		const replyInsert = await env.forum_db
			.prepare("INSERT INTO users (email, username, password, role, verified) VALUES (?, ?, ?, 'user', 1)")
			.bind('reply@example.com', 'reply', passwordHash)
			.run();
		const replyId = Number(replyInsert.meta.last_row_id);

		const replyPostInsert = await env.forum_db
			.prepare('INSERT INTO posts (author_id, title, content) VALUES (?, ?, ?)')
			.bind(replyId, 'reply-post', 'reply-content')
			.run();
		const replyPostId = Number(replyPostInsert.meta.last_row_id);

		const parentCommentInsert = await env.forum_db
			.prepare('INSERT INTO comments (post_id, parent_id, author_id, content) VALUES (?, NULL, ?, ?)')
			.bind(replyPostId, targetId, 'parent-by-target')
			.run();
		const parentCommentId = Number(parentCommentInsert.meta.last_row_id);

		const childCommentInsert = await env.forum_db
			.prepare('INSERT INTO comments (post_id, parent_id, author_id, content) VALUES (?, ?, ?, ?)')
			.bind(replyPostId, parentCommentId, replyId, 'child-by-reply')
			.run();
		const childCommentId = Number(childCommentInsert.meta.last_row_id);

		const security = new Security(env);
		const { token, jti, expiresAt } = await security.generateToken({
			id: targetId,
			role: 'user',
			email: 'target@example.com'
		});
		await env.forum_db.prepare('INSERT INTO sessions (jti, user_id, expires_at) VALUES (?, ?, ?)').bind(jti, targetId, expiresAt).run();

		const now = Math.floor(Date.now() / 1000).toString();
		const nonce = crypto.randomUUID();
		const request = new Request('http://example.com/api/user/delete', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
				'X-Timestamp': now,
				'X-Nonce': nonce
			},
			body: JSON.stringify({ password })
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.success).toBe(true);

		const deletedUser = await env.forum_db.prepare('SELECT id FROM users WHERE id = ?').bind(targetId).first();
		expect(deletedUser).toBeNull();

		const deletedSession = await env.forum_db.prepare('SELECT jti FROM sessions WHERE user_id = ?').bind(targetId).first();
		expect(deletedSession).toBeNull();

		const deletedParentComment = await env.forum_db.prepare('SELECT id FROM comments WHERE id = ?').bind(parentCommentId).first();
		expect(deletedParentComment).toBeNull();

		const childComment = await env.forum_db
			.prepare('SELECT id, author_id, parent_id FROM comments WHERE id = ?')
			.bind(childCommentId)
			.first<{ id: number; author_id: number; parent_id: number | null }>();
		expect(childComment).not.toBeNull();
		expect(childComment?.author_id).toBe(replyId);
		expect(childComment?.parent_id).toBeNull();
	}, 20000);
});
