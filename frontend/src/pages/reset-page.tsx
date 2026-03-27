import * as React from 'react';

import { SiteFooter } from '@/components/site-footer';
import { TurnstileWidget } from '@/components/turnstile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfig } from '@/hooks/use-config';
import { getSecurityHeaders } from '@/lib/api';

export function ResetPage() {
	const { config } = useConfig();
	const siteName = config?.site_name || 'D1 Forum';
	const siteAvatarUrl = config?.site_avatar_url || '';
	const enabled = !!config?.turnstile_enabled;
	const siteKey = config?.turnstile_site_key || '';

	const params = new URLSearchParams(window.location.search);
	const token = params.get('token') || '';

	const [password, setPassword] = React.useState('');
	const [totpCode, setTotpCode] = React.useState('');
	const [turnstileToken, setTurnstileToken] = React.useState('');
	const [turnstileResetKey, setTurnstileResetKey] = React.useState(0);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState('');
	const [success, setSuccess] = React.useState('');

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError('');
		setSuccess('');
		if (!token) return setError('缺少重置 token');
		if (enabled && !turnstileToken) return setError('请完成验证码验证');
		setLoading(true);
		try {
			const res = await fetch('/api/auth/reset-password', {
				method: 'POST',
				headers: getSecurityHeaders('POST'),
				body: JSON.stringify({
					token,
					new_password: password,
					totp_code: totpCode,
					'cf-turnstile-response': turnstileToken
				})
			});
			const data = (await res.json()) as any;
			if (!res.ok) {
				setTurnstileToken('');
				setTurnstileResetKey((v) => v + 1);
				throw new Error(data?.error || '重置失败');
			}
			setSuccess('密码重置成功，请重新登录。');
			setPassword('');
			setTotpCode('');
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
						<div className="text-sm text-muted-foreground">设置新密码</div>
					</div>
				</a>
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>重置密码</CardTitle>
					</CardHeader>
					<CardContent>
						<form className="space-y-4" onSubmit={handleSubmit}>
							{error ? <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
							{success ? <div className="rounded-md border bg-muted/40 p-3 text-sm">{success}</div> : null}
							<div className="space-y-2">
								<Label htmlFor="reset-password">新密码</Label>
								<Input
									id="reset-password"
									type="password"
									autoComplete="new-password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="reset-totp">双重验证码 (若开启)</Label>
								<Input
									id="reset-totp"
									type="text"
									inputMode="numeric"
									maxLength={6}
									autoComplete="one-time-code"
									value={totpCode}
									onChange={(e) => setTotpCode(e.target.value)}
								/>
							</div>
							<TurnstileWidget enabled={enabled} siteKey={siteKey} onToken={setTurnstileToken} resetKey={turnstileResetKey} />
							<Button className="w-full" type="submit" disabled={loading}>
								{loading ? '处理中...' : '重置密码'}
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

