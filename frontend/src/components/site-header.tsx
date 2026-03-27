import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { getUser, logout, type User } from '@/lib/auth';
import { getTheme, toggleTheme, type Theme } from '@/lib/theme';
import { Home, LogIn, LogOut, Moon, Settings, Shield, Sun, User as UserIcon, UserPlus } from 'lucide-react';

export function SiteHeader({
	currentUser,
	siteName,
	siteAvatarUrl,
	onLogout
}: {
	currentUser: User | null;
	siteName: string;
	siteAvatarUrl: string;
	onLogout?: () => void;
}) {
	const user = currentUser ?? getUser();
	const [theme, setTheme] = React.useState<Theme>(() => getTheme());

	React.useEffect(() => {
		function onThemeChange(e: Event) {
			const next = (e as CustomEvent).detail;
			if (next === 'light' || next === 'dark') setTheme(next);
		}
		window.addEventListener('theme-change', onThemeChange as any);
		setTheme(getTheme());
		return () => window.removeEventListener('theme-change', onThemeChange as any);
	}, []);
	return (
		<header className="w-full border-b bg-background">
			<div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:gap-4">
				<a
					href="/"
					className="inline-flex min-w-0 items-center gap-3 rounded-md border border-transparent px-2 py-1 text-foreground hover:bg-muted/40"
				>
					{siteAvatarUrl ? (
						<img src={siteAvatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
					) : (
						<span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
							<Home className="h-5 w-5" />
						</span>
					)}
					<span className="min-w-0 truncate text-sm font-semibold sm:text-base">{siteName}</span>
				</a>
				<div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
					<Button type="button" variant="ghost" size="sm" onClick={toggleTheme}>
						{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
						<span className="sr-only">切换主题</span>
					</Button>
					{user ? (
						<>
							<span className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground sm:inline-flex">
								{user.avatar_url ? (
									<img
										src={user.avatar_url}
										alt=""
										className="h-7 w-7 rounded-full object-cover"
										loading="lazy"
										referrerPolicy="no-referrer"
									/>
								) : (
									<span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
										<UserIcon className="h-4 w-4" />
									</span>
								)}
								<span className="truncate">
									欢迎，<span className="text-foreground">{user.username}</span>
								</span>
								{user.role === 'admin' ? (
									<span className="inline-flex items-center gap-1 rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">
										<Shield className="h-3 w-3" />
										<span className="sr-only">管理员</span>
									</span>
								) : null}
							</span>
							{user.role === 'admin' ? (
								<Button asChild variant="ghost" size="sm">
									<a href="/admin">
										<Shield className="h-4 w-4" />
										<span className="sr-only">管理后台</span>
									</a>
								</Button>
							) : null}
							<Button asChild variant="ghost" size="sm">
								<a href="/settings">
									<Settings className="h-4 w-4" />
									<span className="sr-only">设置</span>
								</a>
							</Button>
							<Separator orientation="vertical" className="hidden h-6 sm:block" />
							<Button
								variant="destructive"
								size="sm"
								onClick={() => {
									logout();
									onLogout?.();
									window.location.href = '/';
								}}
							>
								<LogOut className="h-4 w-4" />
								<span className="sr-only">退出</span>
							</Button>
						</>
					) : (
						<>
							<Button asChild variant="ghost" size="sm">
								<a href="/login">
									<LogIn className="h-4 w-4" />
									<span className="sr-only">登录</span>
								</a>
							</Button>
							<Button asChild size="sm">
								<a href="/register">
									<UserPlus className="h-4 w-4" />
									<span className="sr-only">注册</span>
								</a>
							</Button>
						</>
					)}
				</div>
			</div>
		</header>
	);
}
