import * as React from 'react';

import { SiteFooter } from '@/components/site-footer';
import { TurnstileWidget } from '@/components/turnstile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfig } from '@/hooks/use-config';
import { getSecurityHeaders } from '@/lib/api';

export function ForgotPage() {
	const { config } = useConfig();
	const siteName = config?.site_name || 'D1 Forum';
	const siteAvatarUrl = config?.site_avatar_url || '';
	const enabled = !!config?.turnstile_enabled;
	const siteKey = config?.turnstile_site_key || '';

	const [email, setEmail] = React.useState('');
	const [turnstileToken, setTurnstileToken] = React.useState('');
	const [turnstileResetKey, setTurnstileResetKey] = React.useState(0);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState('');
	const [success, setSuccess] = React.useState('');

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError('');
		setSuccess('');
		if (enabled && !turnstileToken) return setError('请完成验证码验证');
		setLoading(true);
		try {
			const res = await fetch('/api/auth/forgot-password', {
				method: 'POST',
				headers: getSecurityHeaders('POST'),
				body: JSON.stringify({ email, 'cf-turnstile-response': turnstileToken })
			});
			const data = (await res.json()) as any;
			if (!res.ok) {
				setTurnstileToken('');
				setTurnstileResetKey((v) => v + 1);
				throw new Error(data?.error || '发送失败');
			}
			setSuccess('如果账号存在，重置邮件已发送。');
			setEmail('');
			setTurnstileToken('');
			setTurnstileResetKey((v) => v + 1);
		} catch (e: any) {
			setError(String(e?.message || e));
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
						<div className="text-sm text-muted-foreground">找回你的账号</div>
					</div>
				</a>
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>忘记密码</CardTitle>
					</CardHeader>
					<CardContent>
						<form className="space-y-4" onSubmit={handleSubmit}>
							{error ? <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
							{success ? <div className="rounded-md border bg-muted/40 p-3 text-sm">{success}</div> : null}
							<div className="space-y-2">
								<Label htmlFor="forgot-email">邮箱</Label>
								<Input
									id="forgot-email"
									type="email"
									autoComplete="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
								/>
							</div>
							<TurnstileWidget enabled={enabled} siteKey={siteKey} onToken={setTurnstileToken} resetKey={turnstileResetKey} />
							<Button className="w-full" type="submit" disabled={loading}>
								{loading ? '发送中...' : '发送重置链接'}
							</Button>
							<div className="text-sm">
								<a className="text-muted-foreground hover:underline" href="/login">
									返回登录
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

