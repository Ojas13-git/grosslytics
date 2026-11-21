import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import * as v from 'valibot';
import { BeaconSchema } from '@grosslytics/shared/schemas';
import { AI_CRAWLER_AGENTS } from '@grosslytics/shared/constants';
import { analyticsPath, referrerHost } from '@grosslytics/shared/privacy';
import type { DeviceType, EnrichedEvent } from '@grosslytics/shared/types';
import type { Bindings } from '../env.js';
import { accountActive, CLOUD_EVENT_CAP, isCloud, usageMonth } from '../cloud.js';
import { hashToken } from '../auth.js';
import { clientKey, limited } from '../limits.js';

type CollectorCf = { asn?: number; verifiedBotCategory?: string; country?: string; city?: string; colo?: string; asOrganization?: string };
export const collectRoute = new Hono<{ Bindings: Bindings; Variables: { collectorCf: CollectorCf } }>();

export function parseDevice(ua: string): { deviceType: DeviceType; os: string; browser: string } {
	let deviceType: DeviceType = 'desktop';
	if (/Mobi|Android/i.test(ua)) deviceType = 'mobile';
	else if (/Tablet|iPad/i.test(ua)) deviceType = 'tablet';

	// iPhone UAs say "like Mac OS X" and Android UAs say "Linux", so the specific checks come first
	let os = 'Unknown';
	if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
	else if (/Android/i.test(ua)) os = 'Android';
	else if (/Mac OS/i.test(ua)) os = 'macOS';
	else if (/Windows/i.test(ua)) os = 'Windows';
	else if (/Linux/i.test(ua)) os = 'Linux';

	// Edge ("Edg/") and Opera ("OPR/") also say Chrome; Chrome, Firefox and Edge on iOS are CriOS, FxiOS and EdgiOS
	let browser = 'Unknown';
	if (/Edg(e|A|iOS)?\//i.test(ua)) browser = 'Edge';
	else if (/OPR\//i.test(ua)) browser = 'Opera';
	else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox';
	else if (/Chrome|CriOS/i.test(ua)) browser = 'Chrome';
	else if (/Safari/i.test(ua)) browser = 'Safari';

	return { deviceType, os, browser };
}

// Generic crawler tokens, headless browsers and HTTP libraries. An empty UA is a bot: real browsers always send one.
const BOT_UA = /bot|crawl|spider|slurp|headless|phantom|puppeteer|playwright|selenium|lighthouse|pingdom|uptime|curl|wget|python-|httpclient|okhttp|go-http|axios|node-fetch|java\//i;
// Cloud/hosting networks real Chrome scrapers run from. Consumer VPN networks and Microsoft (corporate/AVD) are deliberately left out.
const DATACENTER_ASNS = new Set([16509, 14618, 396982, 31898, 45102, 132203, 14061, 16276, 24940, 63949, 20473, 51167, 212238, 30058, 398781]);

export function isBotRequest(ua: string, cf: { asn?: number; verifiedBotCategory?: string }): boolean {
	return !ua || BOT_UA.test(ua) || !!cf.verifiedBotCategory || DATACENTER_ASNS.has(Number(cf.asn));
}

// The site ID is public (it sits in page source), so events are only accepted from the site's own domain, its subdomains, or local dev.
export function originAllowed(origin: string, domain: string, allowLocal = true): boolean {
	if (!origin) return allowLocal;
	let host: string;
	try {
		const url = new URL(origin);
		if (url.protocol !== 'https:' && (url.protocol !== 'http:' || !allowLocal)) return false;
		host = url.hostname.toLowerCase();
	} catch {
		return false;
	}
	if (allowLocal && (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost'))) return true;
	const site = domain.toLowerCase().replace(/^www\./, '');
	return host === site || host.endsWith(`.${site}`);
}

// shortcut: per-isolate cache, so a deleted site keeps accepting events for up to a minute, and a Cloud account can overshoot its cap by about a minute of traffic.
type SiteGate = { domain: string | null; open: boolean };
const siteCache = new Map<string, SiteGate & { expires: number }>();
/** The site's domain, and whether it may record events: always on self-host; on Cloud, while its account is active and under the monthly cap. */
async function siteGate(env: Bindings, siteId: string): Promise<SiteGate> {
	const hit = siteCache.get(siteId);
	if (hit && hit.expires > Date.now()) return hit;
	let gate: SiteGate;
	if (isCloud(env)) {
		const row = await env.DB.prepare(
			`SELECT s.domain, a.status, a.trial_ends_at, x.account_id, COALESCE(u.events, 0) AS used FROM sites s
			 LEFT JOIN account_sites x ON x.site_id = s.site_id LEFT JOIN accounts a ON a.id = x.account_id
			 LEFT JOIN account_usage u ON u.account_id = x.account_id AND u.month = ? WHERE s.site_id = ? LIMIT 1`,
		)
			.bind(usageMonth(), siteId)
			.first<{ domain: string; status: string | null; trial_ends_at: number | null; account_id: string | null; used: number }>();
		// A site with no account was made with API_TOKEN by the operator, so no cap
		const open = !!row && (!row.account_id || (!!row.status && accountActive({ status: row.status, trial_ends_at: row.trial_ends_at ?? 0 }) && row.used < CLOUD_EVENT_CAP));
		gate = { domain: row?.domain ?? null, open };
	} else {
		const row = await env.DB.prepare('SELECT domain FROM sites WHERE site_id = ? LIMIT 1').bind(siteId).first<{ domain: string }>();
		gate = { domain: row?.domain ?? null, open: true };
	}
	if (siteCache.size > 10_000) siteCache.clear();
	siteCache.set(siteId, { ...gate, expires: Date.now() + 60_000 });
	return gate;
}

const MAX_BODY_BYTES = 8 * 1024;

const crawlerOf = (ua: string) => AI_CRAWLER_AGENTS.find((agent) => ua.includes(agent));

/** One more hit for this bot on this page today (UTC). Kept apart from events so bots never count as visitors. */
export function recordCrawl(db: D1Database, siteId: string, bot: string, path: string) {
	return db
		.prepare("INSERT INTO ai_crawls (site_id, day, bot, path, hits) VALUES (?, date('now'), ?, ?, 1) ON CONFLICT (site_id, day, bot, path) DO UPDATE SET hits = hits + 1")
		.bind(siteId, bot, analyticsPath(path).slice(0, 300))
		.run();
}

/**
 * POST /api/crawl {sid, path, ua}: the owner's server reports an AI crawler's page request.
 * Crawlers don't run JavaScript, so g.js never sees them; a few lines of middleware on the site do (see /docs).
 * The server authorizes the report with a site-specific crawler key.
 */
export const crawlRoute = new Hono<{ Bindings: Bindings }>();
collectRoute.use('*', async (c, next) => {
	c.set('collectorCf', (c.req.raw.cf ?? {}) as CollectorCf);
	await next();
}, bodyLimit({ maxSize: MAX_BODY_BYTES }));
crawlRoute.use('*', bodyLimit({ maxSize: MAX_BODY_BYTES }));
const CrawlBody = v.object({
	sid: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	path: v.pipe(v.string(), v.minLength(1), v.maxLength(2048)),
	ua: v.pipe(v.string(), v.maxLength(1024)),
});
crawlRoute.post('/', async (c) => {
	if (c.env.ENVIRONMENT === 'production' && (!c.env.INGEST_SITE_LIMITER || !c.env.INGEST_SOURCE_LIMITER)) return c.text('Crawler rate limiting is not configured', 503);
	if (await limited(c.env.INGEST_SOURCE_LIMITER, `crawl:${clientKey(c.req.raw)}`)) return c.text('Rate limited', 429);
	const key = c.req.header('authorization')?.match(/^Bearer (gl_crawl_[a-f0-9]{40})$/i)?.[1];
	if (!key) return c.text('Crawler key required', 401);
	const parsed = v.safeParse(CrawlBody, await c.req.json().catch(() => null));
	if (!parsed.success) return c.text('Bad Request', 400);
	const registered = await c.env.DB.prepare('SELECT 1 FROM site_crawl_keys WHERE site_id = ? AND key_hash = ?').bind(parsed.output.sid, await hashToken(key)).first();
	if (!registered) return c.text('Invalid crawler key', 401);
	const bot = crawlerOf(parsed.output.ua);
	if (!bot) return c.text('Accepted', 202); // not an AI crawler: nothing to count
	const { domain, open } = await siteGate(c.env, parsed.output.sid);
	if (!domain) return c.text('Unknown site', 404);
	if (open && !(await limited(c.env.INGEST_SITE_LIMITER, `crawl:${parsed.output.sid}`))) c.executionCtx.waitUntil(recordCrawl(c.env.DB, parsed.output.sid, bot, parsed.output.path).then(() => {}, () => {}));
	return c.text('Accepted', 202);
});

collectRoute.post('/', async (c) => {
	const startTime = Date.now();
	let rawBody: unknown;
	if (c.env.ENVIRONMENT === 'production' && (!c.env.INGEST_SITE_LIMITER || !c.env.INGEST_SOURCE_LIMITER)) return c.text('Ingestion rate limiting is not configured', 503);
	if (await limited(c.env.INGEST_SOURCE_LIMITER, clientKey(c.req.raw))) return c.text('Rate limited', 429);

	const text = await c.req.text().catch(() => '');
	if (!text || text.length > MAX_BODY_BYTES) return c.text('Bad Request', 400);
	try {
		rawBody = JSON.parse(text);
	} catch {
		return c.text('Invalid JSON', 400);
	}

	const parsed = v.safeParse(BeaconSchema, rawBody);
	if (!parsed.success) {
		return c.text('Bad Request', 400);
	}

	const beacon = parsed.output;
	const req = c.req.raw;
	const ua = req.headers.get('user-agent') || '';

	const cf = c.get('collectorCf') || {};
	const accepted = () => c.text('Accepted', 202, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });

	// Crawler counts come from the authenticated server integration.
	const eventType = beacon.t;
	if (eventType === 'ai_crawl' || crawlerOf(ua) || isBotRequest(ua, cf)) return accepted();

	const { domain, open } = await siteGate(c.env, beacon.sid);
	if (!domain) return c.text('Unknown site', 404);
	const local = c.env.ENVIRONMENT !== 'production' || ['localhost', '127.0.0.1'].includes(new URL(req.url).hostname);
	if (!originAllowed(req.headers.get('origin') || '', domain, local)) return c.text('Forbidden', 403);
	// Trial over or plan cap reached: the visitor's page must not notice, so this answers like a recorded event
	if (!open) return accepted();
	if (await limited(c.env.INGEST_SITE_LIMITER, beacon.sid)) return accepted();

	const vid = beacon.vid;
	const path = beacon.t === 'goal' ? beacon.n : analyticsPath(beacon.n);
	const ref = referrerHost(beacon.ref) || (/^[a-z0-9.-]+$/i.test(beacon.ref) ? beacon.ref : '');

	// 3. Extract Cloudflare Edge Geolocation
	const country = (cf.country as string) || 'XX';
	const city = (cf.city as string) || '';
	const colo = (cf.colo as string) || 'DFW';
	const asOrganization = (cf.asOrganization as string) || '';

	const { deviceType, os, browser } = parseDevice(ua);

	const enriched: EnrichedEvent = {
		...beacon,
		n: path,
		ref,
		vid,
		t: eventType,
		country,
		city,
		colo,
		asOrganization,
		deviceType,
		os,
		browser,
		createdAt: Math.floor(startTime / 1000),
	};

	// 4. Async queue push: never block on DB write
	c.executionCtx.waitUntil(
		(async () => {
			// Push to ingestion queue
			if (c.env.INGEST_QUEUE) {
				await c.env.INGEST_QUEUE.send(enriched);
			}

			// Notify Durable Object for real-time presence
			if (c.env.SITE_LIVE_HUB && eventType === 'pageview') {
				try {
					const doId = c.env.SITE_LIVE_HUB.idFromName(beacon.sid);
					const stub = c.env.SITE_LIVE_HUB.get(doId);
					await stub.fetch('http://do/internal/presence', {
						method: 'POST',
						body: JSON.stringify({
							visitorId: vid,
							page: path,
							source: beacon.src,
							country,
							city,
							timestamp: startTime,
						}),
					});
				} catch {
					// Presence broadcast failure should not affect beacon
				}
			}
		})(),
	);

	// Return 202 Accepted in <5ms
	return c.text('Accepted', 202, {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Cache-Control': 'no-store',
	});
});

// CORS preflight
collectRoute.options('/', (c) => {
	return c.body(null, 204, {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
	});
});
