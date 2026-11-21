import { Hono } from 'hono';
import { requireToken } from './auth.js';
import { requireFooter } from './footer.js';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { collectRoute, crawlRoute } from './routes/collect.js';
import { statsRoute } from './routes/stats.js';
import { webhooksRoute } from './routes/webhooks.js';
import { shareRoute } from './routes/share.js';
import { waitlistRoute } from './routes/waitlist.js';
import { mcpRoute } from './mcp.js';
import { authRoute } from './routes/auth.js';
import { billingRoute } from './routes/billing.js';
import { licenseRoute } from './routes/license.js';
import { cleanup, handleQueueBatch, pruneEvents } from './consumer.js';
import type { EnrichedEvent } from '@grosslytics/shared/types';
import { isCloud } from './cloud.js';
import type { Bindings } from './env.js';
import { migrateSiteSecrets } from './site-secrets.js';

export { SiteLiveHub } from './durable-object.js';

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for dashboard and tracker
const dashboardCors = cors({
	origin: (origin) => origin || '*',
	allowMethods: ['GET', 'POST', 'OPTIONS'],
	allowHeaders: ['Content-Type', 'Authorization'],
});
// Preserve the upgraded socket response through the HTTP middleware.
app.use('*', (c, next) => c.req.header('upgrade')?.toLowerCase() === 'websocket' ? next() : dashboardCors(c, next));

// Health check
app.get('/', (c) => c.text('Grosslytics Edge API Online', 200));

// Owner APIs use a bearer token or session. WebSocket upgrades use a one-time ticket.
// The /app owner signs in with a password (session cookie); API_TOKEN is the master key; gl_pat_ tokens are read-only per site.
app.use('/api/stats/*', bodyLimit({ maxSize: 1024 * 1024 }));
app.use('/api/mcp/*', bodyLimit({ maxSize: 1024 * 1024 }));
app.use('/api/stats/*', requireToken);
app.use('/api/mcp/*', requireToken);
app.use('/api/stats/*', requireFooter);
app.use('/api/mcp/*', requireFooter);

// Mount routes
// /api/event: EasyPrivacy blocks URLs ending in /api/collect. The old path stays for snippets already installed.
app.route('/api/event', collectRoute);
app.route('/api/collect', collectRoute);
app.route('/api/crawl', crawlRoute);
app.route('/api/stats', statsRoute);
app.route('/api/webhooks', webhooksRoute);
app.route('/api/share', shareRoute);
app.route('/api/waitlist', waitlistRoute);
app.route('/api/mcp', mcpRoute);
app.route('/api/auth', authRoute);
app.route('/api/billing', billingRoute);
app.route('/api/license', licenseRoute);

// Export worker handler with fetch and queue consumer
export default {
	fetch: app.fetch,
	async queue(batch: MessageBatch<EnrichedEvent>, env: Bindings): Promise<void> {
		await handleQueueBatch(batch, env);
	},
	// Daily cron (wrangler.toml [triggers])
	async scheduled(_event: ScheduledController, env: Bindings): Promise<void> {
		await cleanup(env.DB);
		await migrateSiteSecrets(env);
		// shortcut: self-host deletes at most 20,000 events a day to stay inside D1's free daily write allowance, so a site recording more than that never catches up; make it configurable if one appears
		await pruneEvents(env.DB, isCloud(env) ? 250 : 10);
	},
};
