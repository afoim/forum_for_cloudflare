import * as React from 'react';

import { attachFancybox, highlightCodeBlocks, renderMarkdownToHtml } from '@/lib/markdown';

export function SiteFooter({ markdown }: { markdown?: string | null }) {
	const content = markdown || '';
	const contentRef = React.useRef<HTMLElement | null>(null);

	React.useEffect(() => {
		const el = contentRef.current;
		if (!el || !content) return;
		highlightCodeBlocks(el);
		const cleanup = attachFancybox(el);
		return cleanup;
	}, [content]);

	if (!content) return null;

	return (
		<footer className="border-t bg-muted/10">
			<div className="mx-auto w-full max-w-5xl px-4 py-6">
				<div
					ref={contentRef}
					className="prose prose-sm max-w-none text-muted-foreground break-words [&_a]:break-all [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1"
					dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(content) }}
				/>
			</div>
		</footer>
	);
}
