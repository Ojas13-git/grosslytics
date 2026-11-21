export function analyticsPath(path: string): string {
	return (path.split(/[?#]/, 1)[0] || '/')
		.replace(/\/(reset(?:-password)?|password-reset|verify(?:-email)?|magic-link|invite|oauth|token)\/.+/i, '/$1/:redacted')
		.replace(/\/[^/]*(?:@|%40)[^/]*/gi, '/:redacted')
		.replace(/\/(?:[a-z0-9_]{24,}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})(?=\/|$)/gi, '/:redacted');
}

export function referrerHost(referrer: string): string {
	try {
		const url = new URL(referrer);
		return /^https?:$/.test(url.protocol) ? url.hostname : '';
	} catch {
		return '';
	}
}
