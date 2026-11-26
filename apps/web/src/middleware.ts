import { defineMiddleware } from 'astro:middleware';

// Pages rendered on request skip the installer's _headers file, so self-hosted copies mark them noindex here
export const onRequest = defineMiddleware(async (ctx, next) => {
	const res = await next();
	const response = new Response(res.body, res);
	if (ctx.url.hostname !== 'grosslytics.com')
		response.headers.set('X-Robots-Tag', 'noindex, nofollow');
	response.headers.set('Strict-Transport-Security', 'max-age=31536000');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	const privateRoute =
		ctx.url.pathname.startsWith('/app') || ctx.url.pathname.startsWith('/license');
	response.headers.set(
		'Referrer-Policy',
		privateRoute ? 'no-referrer' : 'strict-origin-when-cross-origin',
	);
	response.headers.append(
		'Content-Security-Policy',
		"frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
	);
	return response;
});
