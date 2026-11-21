import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Bindings } from '../env.js';
import { hashToken } from '../auth.js';
import { canSendProof, redeemEmailProof, sendEmailProof } from '../email-proof.js';
import { clientKey, limited } from '../limits.js';

/**
 * Lifetime licenses, served by the operator's deployment (grosslytics.com), not by customers' installs.
 * The checkout sends the buyer to /license?payment_id=… (Dodo) or ?session_id=… (Stripe); the billing webhook has recorded that session, so the
 * page verifies the buyer's email before showing the key. `npx grosslytics install` then downloads the release bundle with the key.
 */
export const licenseRoute = new Hono<{ Bindings: Bindings }>();
licenseRoute.use('/claim', bodyLimit({ maxSize: 2048 }));

export const LICENSE_PREFIX = 'gl_lic_';

/** Same session, same key: the key never needs storing, only its hash. */
export async function licenseKey(secret: string, sessionId: string): Promise<string> {
	const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(sessionId)));
	return LICENSE_PREFIX + Array.from(mac.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Called by the billing webhook for a paid one-time checkout. Idempotent: webhook retries are harmless. */
export async function mintLicense(env: Bindings, provider: 'stripe' | 'dodo', sessionId: string, paymentRef: string, email: string | null): Promise<boolean> {
	if (!env.LICENSE_SECRET) return false;
	const key = await licenseKey(env.LICENSE_SECRET, sessionId);
	await env.DB.batch([
		env.DB.prepare('INSERT INTO licenses (key_hash, session_id, email) VALUES (?, ?, ?) ON CONFLICT (session_id) DO NOTHING').bind(await hashToken(key), sessionId, email),
		env.DB.prepare('INSERT INTO license_payments VALUES (?, ?, ?) ON CONFLICT DO NOTHING').bind(sessionId, provider, paymentRef),
	]);
	return true;
}

const validLicense = `NOT EXISTS (
	SELECT 1 FROM license_refunds r LEFT JOIN license_payments p ON p.session_id = l.session_id
	WHERE (r.provider = p.provider AND r.payment_ref = p.payment_ref)
	   OR (r.provider = 'dodo' AND r.payment_ref = l.session_id)
)`;
const privateResponse = { 'Cache-Control': 'no-store' };

licenseRoute.post('/claim', async (c) => {
	if (c.env.ENVIRONMENT === 'production' && !c.env.LICENSE_LIMITER) return c.json({ error: 'License claim rate limiting is not configured.' }, 503);
	if (!/^application\/json(?:\s*;|$)/i.test(c.req.header('content-type') || '')) return c.json({ error: 'JSON required.' }, 415);
	if (await limited(c.env.LICENSE_LIMITER, clientKey(c.req.raw))) return c.json({ error: 'Too many requests. Try again in a minute.' }, 429);
	const body = (await c.req.json().catch(() => null)) as { sessionId?: unknown; code?: unknown } | null;
	const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
	if (!c.env.LICENSE_SECRET) return c.json({ error: 'Lifetime licenses are not set up on this server.' }, 503);
	if (!/^(cs|pay)_[A-Za-z0-9_]{10,255}$/.test(sessionId)) return c.json({ error: 'Missing or invalid checkout session.' }, 400);
	const row = await c.env.DB.prepare(`SELECT email FROM licenses l WHERE session_id = ? AND ${validLicense}`).bind(sessionId).first<{ email: string | null }>();
	if (!row) return c.json({ error: 'No active license was found for this checkout.' }, 404, privateResponse);
	const code = typeof body?.code === 'string' ? body.code.trim() : '';
	if (!code) {
		if (!row.email || !canSendProof(c.env)) return c.json({ error: 'Email verification is unavailable. Contact support for help claiming this license.' }, 503, privateResponse);
		try {
			await sendEmailProof(c.env, 'license', sessionId, row.email);
		} catch {
			return c.json({ error: 'Could not send the verification code. Try again later.' }, 503, privateResponse);
		}
		return c.json({ verifyEmail: true }, 202, privateResponse);
	}
	if (!(await redeemEmailProof(c.env.DB, 'license', sessionId, code))) return c.json({ error: 'Invalid or expired verification code.' }, 400, privateResponse);
	return c.json({ key: await licenseKey(c.env.LICENSE_SECRET, sessionId) }, 200, privateResponse);
});

// GET /api/license/download (Authorization: Bearer gl_lic_…) - the latest release bundle for the installer
licenseRoute.get('/download', async (c) => {
	const key = c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
	if (!key.startsWith(LICENSE_PREFIX)) return c.json({ error: 'A license key (gl_lic_…) is required.' }, 401);
	const hash = await hashToken(key);
	const row = await c.env.DB.prepare(`SELECT session_id FROM licenses l WHERE key_hash = ? AND ${validLicense}`).bind(hash).first();
	if (!row) return c.json({ error: 'That license key is not valid.' }, 401);
	const obj = await c.env.RELEASES?.get('latest.tgz');
	if (!obj) return c.json({ error: 'No release has been published yet.' }, 503);
	await c.env.DB.prepare('UPDATE licenses SET last_download_at = unixepoch() WHERE key_hash = ?').bind(hash).run();
	return new Response(obj.body, { headers: { 'content-type': 'application/gzip', 'cache-control': 'no-store' } });
});
