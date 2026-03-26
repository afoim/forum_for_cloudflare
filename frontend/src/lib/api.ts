import { getToken, logout } from '@/lib/auth';

export type ForumConfig = {
	turnstile_enabled: boolean;
	turnstile_site_key: string;
	user_count?: number;
};

export type SessionInfo = {
	valid: boolean;
	user: {
		id: number;
		email: string;
		role: string;
	};
};

export type Category = {
	id: number;
	name: string;
	created_at: string;
};

export type Post = {
	id: number;
	author_id: number;
	title: string;
	content: string;
	category_id: number | null;
	category_name?: string | null;
	is_pinned?: number;
	view_count?: number;
	created_at: string;
	author_name?: string;
	author_avatar?: string | null;
	author_role?: 'admin' | 'user';
	like_count?: number;
	comment_count?: number;
	liked?: boolean;
};

export type Comment = {
	id: number;
	post_id: number;
	parent_id: number | null;
	author_id: number;
	username: string;
	avatar_url?: string | null;
	role?: 'admin' | 'user';
	content: string;
	created_at: string;
};

const API_BASE = '/api';

export function getSecurityHeaders(method: string, contentType: string | null = 'application/json') {
	const headers: Record<string, string> = {};
	const token = getToken();
	if (token) headers.Authorization = `Bearer ${token}`;
	if (['POST', 'PUT', 'DELETE'].includes(method.toUpperCase())) {
		headers['X-Timestamp'] = Math.floor(Date.now() / 1000).toString();
		headers['X-Nonce'] = crypto.randomUUID();
	}
	if (contentType) headers['Content-Type'] = contentType;
	return headers;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${API_BASE}${path}`, init);
	if (res.status === 401) {
		logout();
		throw new Error('登录已过期，请重新登录');
	}
	const text = await res.text();
	const data = text ? (JSON.parse(text) as any) : null;
	if (!res.ok) {
		throw new Error(data?.error || `请求失败 (${res.status})`);
	}
	return data as T;
}

export async function checkSession(): Promise<SessionInfo> {
	return apiFetch<SessionInfo>('/session', {
		headers: getSecurityHeaders('GET')
	});
}

export function formatDate(dateString: string | null | undefined) {
	if (!dateString) return '';
	const date = new Date(dateString.endsWith('Z') ? dateString : `${dateString}Z`);
	return date.toLocaleString('zh-CN', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}
