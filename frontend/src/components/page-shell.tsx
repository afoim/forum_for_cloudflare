import * as React from 'react';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { useConfig } from '@/hooks/use-config';
import { getUser, type User } from '@/lib/auth';

export function PageShell({
	children
}: {
	children: React.ReactNode;
}) {
	const [user, setUser] = React.useState<User | null>(() => getUser());
	const { config } = useConfig();

	return (
		<div className="min-h-dvh bg-background">
			<SiteHeader
				currentUser={user}
				siteName={config?.site_name || 'D1 Forum'}
				siteAvatarUrl={config?.site_avatar_url || ''}
				onLogout={() => setUser(null)}
			/>
			<div className="flex min-h-[calc(100dvh-4rem)] flex-col">
				<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
				<SiteFooter markdown={config?.site_footer_markdown} />
			</div>
		</div>
	);
}

