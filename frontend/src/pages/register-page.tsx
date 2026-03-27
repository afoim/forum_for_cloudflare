import * as React from 'react';

import { SiteFooter } from '@/components/site-footer';
import { TurnstileWidget } from '@/components/turnstile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfig } from '@/hooks/use-config';
import { getSecurityHeaders } from '@/lib/api';

export function RegisterPage() {
	const { config } = useConfig();
	const siteName = config?.site_name || 'D1 Forum';
	const siteAvatarUrl = config?.site_avatar_url || '';
	const [email, setEmail] = React.useState('');
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	const [turnstileToken, setTurnstileToken] = React.useState('');
	const [turnstileResetKey, setTurnstileResetKey] = React.useState(0);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState('');
	const [success, setSuccess] = React.useState('');

	const enabled = !!config?.turnstile_enabled;
	const siteKey = config?.turnstile_site_key || '';

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError('');
		setSuccess('');
		if (enabled && !turnstileToken) {
			setError('请完成验证码验证');
			return;
		}

		setLoading(true);
		try {
			const res = await fetch('/api/register', {
				method: 'POST',
				headers: getSecurityHeaders('POST'),
				body: JSON.stringify({
					email,
					username,
					password,
					'cf-turnstile-response': turnstileToken
				})
			});
			const data = (await res.json()) as any;
			if (!res.ok) {
				setTurnstileToken('');
				setTurnstileResetKey((v) => v + 1);
				throw new Error(data?.error || '注册失败');
			}
			setSuccess('注册成功！请前往邮箱完成验证后再登录。');
			setEmail('');
			setUsername('');
			setPassword('');
			setTurnstileToken('');
			setTurnstileResetKey((v) => v + 1);
		} catch (err: any) {
			setError(String(err?.message || err));
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="flex min-h-dvh flex-col bg-muted/20">
			<main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
				<a href="/" className="inline-flex items-center gap-3 text-foreground">
					{siteAvatarUrl ? (
						<img src={siteAvatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
					) : (
						<div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-semibold">站</div>
					)}
					<div className="text-left">
						<div className="text-lg font-semibold">{siteName}</div>
						<div className="text-sm text-muted-foreground">创建你的账号</div>
					</div>
				</a>
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>注册</CardTitle>
					</CardHeader>
					<CardContent>
						<form className="space-y-4" onSubmit={handleSubmit}>
							{error ? <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
							{success ? <div className="rounded-md border bg-muted/40 p-3 text-sm">{success}</div> : null}

							<div className="space-y-2">
								<Label htmlFor="register-username">用户名 (最多 20 字符)</Label>
								<Input
									id="register-username"
									name="username"
									type="text"
									maxLength={20}
									value={username}
									onChange={(e) => setUsername(e.target.value)}
									required
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="register-email">邮箱</Label>
								<Input
									id="register-email"
									name="email"
									type="email"
									autoComplete="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="register-password">密码 (8-16 字符)</Label>
								<Input
									id="register-password"
									name="password"
									type="password"
									autoComplete="new-password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
								/>
							</div>

							<TurnstileWidget
								enabled={enabled}
								siteKey={siteKey}
								onToken={setTurnstileToken}
								resetKey={turnstileResetKey}
							/>

							<Button className="w-full" type="submit" disabled={loading}>
								{loading ? '处理中...' : '注册'}
							</Button>

							<div className="text-sm">
								<a className="text-muted-foreground hover:underline" href="/login">
									已有账号？登录
								</a>
							</div>
						</form>
					</CardContent>
				</Card>
			</main>
			<SiteFooter markdown={config?.site_footer_markdown} />
		</div>
	);
}
