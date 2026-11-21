import type { Context, Next } from 'hono';
import type { Bindings } from './env.js';
import { requestSite } from './cloud.js';
import { resolvesPublicly } from './domains.js';

/**
 * Free self-hosted installs (REQUIRE_FOOTER=1, set by `bun run setup`) open a site's dashboard only once that site's
 * homepage carries a "Powered by Grosslytics" link. Lifetime installs and Hosted Cloud never set the var.
 */
export const footerRequired = (env: Bindings) => env.REQUIRE_FOOTER === '1';

const RECHECK_SECONDS = 86400;
const OUTAGE_GRACE_SECONDS = 2 * RECHECK_SECONDS;
const OUTAGE_RETRY_SECONDS = 3600;
const now = () => Math.floor(Date.now() / 1000);

/** Looks in the homepage footer for a link to grosslytics.com whose text names Grosslytics. */
// shortcut: reads the served HTML of the homepage only, so a footer added by client-side JavaScript is not seen; render the page if SPA owners ask.
export async function checkFooter(domain: string): Promise<'ok' | 'missing' | 'unreachable'> {
	let res: Response;
	try {
		const signal = AbortSignal.timeout(8000);
		const options = {
			headers: { 'user-agent': 'GrosslyticsFooterCheck/1.0 (+https://grosslytics.com)' },
			signal,
			redirect: 'manual' as const,
		};
		if (!(await resolvesPublicly(domain))) return 'unreachable';
		const homepage = `https://${domain}/`;
		res = await fetch(homepage, options);
		const location = res.headers.get('location');
		if (res.status >= 300 && res.status < 400 && location) {
			await res.body?.cancel();
			const next = new URL(location, homepage);
			if (next.protocol !== 'https:' || next.username || next.password || next.port ||
				![domain, `www.${domain}`].includes(next.hostname) || !(await resolvesPublicly(next.hostname))) return 'unreachable';
			res = await fetch(next, options);
		}
	} catch {
		return 'unreachable';
	}
	if (!res.ok || !res.body) return 'unreachable';
	let bytes = 0;
	const body = res.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			bytes += chunk.byteLength;
			if (bytes > 512 * 1024) controller.error(new Error('Homepage is too large'));
			else controller.enqueue(chunk);
		},
	}));
	let found = false;
	let text: string | null = null; // the text of the candidate link being read, or null outside one
	const page = new HTMLRewriter()
			.on('footer:not([hidden]) a[href], [role="contentinfo"]:not([hidden]) a[href]', {
			element(el) {
					if (el.hasAttribute('hidden')) return;
					let target: URL;
				try {
						target = new URL(el.getAttribute('href') ?? '');
					} catch {
						return;
					}
					if (target.protocol !== 'https:' || target.username || target.password || target.port ||
						!/^(www\.)?grosslytics\.com$/i.test(target.hostname)) return;
				text = '';
				el.onEndTag(() => {
					if (/grosslytics/i.test(text ?? '')) found = true;
					text = null;
				});
			},
			text(t) {
				if (text !== null) text += t.text;
			},
		})
		.transform(new Response(body, { headers: { 'content-type': res.headers.get('content-type') || 'text/html' } }));
	try {
		await page.arrayBuffer();
	} catch {
		return 'unreachable';
	}
	return found ? 'ok' : 'missing';
}

/** Checks the site now and stores the result. A verified site is one with a `site_footer` row. */
export async function verifyFooter(db: D1Database, siteId: string, domain: string) {
	const result = await checkFooter(domain);
	if (result === 'unreachable') return result;
	await db.batch([
		result === 'ok'
			? db.prepare('INSERT INTO site_footer (site_id, checked_at) VALUES (?, ?) ON CONFLICT (site_id) DO UPDATE SET checked_at = excluded.checked_at').bind(siteId, now())
			: db.prepare('DELETE FROM site_footer WHERE site_id = ?').bind(siteId),
		db.prepare('DELETE FROM site_footer_outages WHERE site_id = ?').bind(siteId),
	]);
	return result;
}

export type FooterSite = { site_id: string; domain: string; checked_at: number | null; attempted_at: number | null };

/** Shared by dashboard, MCP, and public sharing. Only a successful fetch renews verification. */
export async function footerAllowed(db: D1Database, row: FooterSite): Promise<boolean> {
	const { site_id: siteId, domain } = row;
	if (domain === 'localhost') return true;
	if (row.checked_at === null) return false;
	const age = now() - row.checked_at;
	if (age < RECHECK_SECONDS) return true;
	const inGrace = age < OUTAGE_GRACE_SECONDS;
	if (row.attempted_at !== null && now() - row.attempted_at < OUTAGE_RETRY_SECONDS) {
		// Crossing the grace deadline still needs to relock the site and expose the Verify step.
		if (inGrace) return true;
	} else {
		const result = await verifyFooter(db, siteId, domain);
		if (result !== 'unreachable') return result === 'ok';
		if (inGrace) {
			await db.prepare('INSERT INTO site_footer_outages (site_id, attempted_at) SELECT site_id, ?1 FROM site_footer WHERE site_id = ?2 AND checked_at = ?3 ON CONFLICT (site_id) DO UPDATE SET attempted_at = excluded.attempted_at')
				.bind(now(), siteId, row.checked_at).run();
			return true;
		}
	}
	await db.batch([
		db.prepare('DELETE FROM site_footer WHERE site_id = ? AND checked_at = ?').bind(siteId, row.checked_at),
		db.prepare('DELETE FROM site_footer_outages WHERE site_id = ?').bind(siteId),
	]);
	return false;
}

const OPEN = /^\/api\/stats\/(sites|waitlist|sites\/[^/]+\/footer)$/;

/** After requireToken on /api/stats and /api/mcp: refuses everything about a site whose footer link isn't verified. Tracking is not affected. */
export async function requireFooter(c: Context<{ Bindings: Bindings }>, next: Next): Promise<Response | void> {
	if (!footerRequired(c.env) || OPEN.test(c.req.path)) return next();
	const siteId = await requestSite(c);
	if (!siteId) return c.json({ error: 'Name one site.' }, 403); // fail closed: every other route here acts on a site
	const row = await c.env.DB.prepare(
		'SELECT s.site_id, s.domain, f.checked_at, o.attempted_at FROM sites s LEFT JOIN site_footer f USING (site_id) LEFT JOIN site_footer_outages o USING (site_id) WHERE s.site_id = ?',
	).bind(siteId).first<FooterSite>();
	// Unknown sites fall through to the route's own answer.
	if (row && !(await footerAllowed(c.env.DB, row))) return c.json({ error: `Add the “Powered by Grosslytics” link to https://${row.domain}/, then verify it on the dashboard.`, footer: true }, 403);
	return next();
}
