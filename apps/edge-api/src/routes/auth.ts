import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Bindings } from '../env.js';
import { hasSession, hashToken, isMaster, SESSION_COOKIE } from '../auth.js';
import { accountActive, CLOUD_EVENT_CAP, isCloud, sessionAccount, TRIAL_DAYS, usageMonth } from '../cloud.js';
import { canSendProof, redeemEmailProof, sendEmailProof } from '../email-proof.js';
import { clientKey, limited } from '../limits.js';

/**
 * /app owner login, like Traks and DataBull: one dashboard password and a 30-day HttpOnly session cookie.
 * Setting (or resetting) the password needs API_TOKEN, so nobody else can claim a fresh deploy.
 */
export const authRoute = new Hono<{ Bindings: Bindings }>();
authRoute.use('*', bodyLimit({ maxSize: 8192 }));
type C = Context<{ Bindings: Bindings }>;

const ITERATIONS = 100_000; // the Workers runtime caps PBKDF2 at 100k iterations
const SESSION_SECONDS = 30 * 86400;
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (h: string) => new Uint8Array((h.match(/../g) ?? []).map((x) => parseInt(x, 16)));
const now = () => Math.floor(Date.now() / 1000);

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
	return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	return `pbkdf2$${ITERATIONS}$${hex(salt)}$${await pbkdf2(password, salt, ITERATIONS)}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [, iter, salt, want] = stored.split('$');
	if (!iter || !salt || !want) return false;
	return isMaster(await pbkdf2(password, unhex(salt), Number(iter)), want);
}

/** Owner session (self-host), or a customer account's session on Hosted Cloud. */
async function startSession(c: C, accountId?: string) {
	const id = hex(crypto.getRandomValues(new Uint8Array(32)));
	const idHash = await hashToken(id);
	await (accountId
		? c.env.DB.prepare('INSERT INTO account_sessions (id_hash, account_id, expires_at) VALUES (?, ?, ?)').bind(idHash, accountId, now() + SESSION_SECONDS)
		: c.env.DB.prepare('INSERT INTO sessions (id_hash, expires_at) VALUES (?, ?)').bind(idHash, now() + SESSION_SECONDS)
	).run();
	setCookie(c, SESSION_COOKIE, id, {
		path: '/api',
		httpOnly: true,
		sameSite: 'Strict',
		secure: new URL(c.req.url).protocol === 'https:',
		maxAge: SESSION_SECONDS,
	});
}

const readBody = async (c: C) => {
	if (!/^application\/json(?:\s*;|$)/i.test(c.req.header('content-type') ?? '')) return {};
	return ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
};
const owner = (db: D1Database) =>
	db.prepare('SELECT password_hash FROM owner_auth WHERE id = 1').first<{ password_hash: string }>();

// GET /api/auth/status - what /app should show: set a password, sign in, or the dashboard
authRoute.get('/status', async (c) => {
	if (isCloud(c.env)) {
		const a = await sessionAccount(c);
		const used = a
			? ((await c.env.DB.prepare('SELECT events FROM account_usage WHERE account_id = ? AND month = ?').bind(a.id, usageMonth()).first<{ events: number }>())?.events ?? 0)
			: 0;
		const account = a && { id: a.id, email: a.email, status: a.status, trialEndsAt: a.trial_ends_at, periodEnd: a.current_period_end, active: accountActive(a), used, cap: CLOUD_EVENT_CAP };
		return c.json({ cloud: true, signedIn: !!a, account }, 200, { 'Cache-Control': 'no-store' });
	}
	const row = await owner(c.env.DB);
	return c.json({ passwordSet: !!row, signedIn: !!row && (await hasSession(c)) }, 200, { 'Cache-Control': 'no-store' });
});

// POST /api/auth/setup {setupKey, password} - first password, or a reset; either way every other session is signed out
authRoute.post('/setup', async (c) => {
	if (isCloud(c.env)) return c.json({ error: 'Hosted Cloud has no owner password. Sign up with an email instead.' }, 404);
	const { setupKey, password } = await readBody(c);
	if (!c.env.API_TOKEN) return c.json({ error: 'API_TOKEN is not configured on this API.' }, 503);
	if (typeof setupKey !== 'string' || !setupKey || !(await isMaster(setupKey, c.env.API_TOKEN))) return c.json({ error: 'That is not this API’s API_TOKEN.' }, 401);
	if (typeof password !== 'string' || password.length < 10 || password.length > 200) return c.json({ error: 'Use a password of at least 10 characters.' }, 400);
	await c.env.DB.batch([
		c.env.DB.prepare(
			'INSERT INTO owner_auth (id, password_hash) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET password_hash = excluded.password_hash, failed_count = 0, locked_until = 0, updated_at = unixepoch()',
		).bind(await hashPassword(password)),
		c.env.DB.prepare('DELETE FROM sessions'),
	]);
	await startSession(c);
	return c.json({ ok: true });
});

// Rate-limit the network before running PBKDF2 instead of locking the target account.
authRoute.post('/login', async (c) => {
	if (c.env.ENVIRONMENT === 'production' && !c.env.LOGIN_LIMITER) return c.json({ error: 'Sign-in rate limiting is not configured.' }, 503);
	if (await limited(c.env.LOGIN_LIMITER, clientKey(c.req.raw))) {
		return c.json({ error: 'Too many sign-in attempts from this network. Try again in a minute.' }, 429);
	}
	if (isCloud(c.env)) return accountLogin(c);
	const { password } = await readBody(c);
	const row = await owner(c.env.DB);
	if (!row) return c.json({ error: 'Set a password first.' }, 409);
	if (typeof password !== 'string' || password.length > 200 || !(await verifyPassword(password, row.password_hash))) return c.json({ error: 'Wrong password.' }, 401);
	await c.env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now()).run();
	await startSession(c);
	return c.json({ ok: true });
});

// POST /api/auth/logout
authRoute.post('/logout', async (c) => {
	const id = getCookie(c, SESSION_COOKIE);
	if (id) {
		const h = await hashToken(id);
		await c.env.DB.batch([c.env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(h), c.env.DB.prepare('DELETE FROM account_sessions WHERE id_hash = ?').bind(h)]);
	}
	deleteCookie(c, SESSION_COOKIE, { path: '/api' });
	return c.json({ ok: true });
});

// Hosted Cloud accounts: verified email + password and a 14-day trial.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const credentials = async (c: C) => {
	const { email, password, code } = await readBody(c);
	return { email: typeof email === 'string' ? email.trim().toLowerCase() : '', password: typeof password === 'string' ? password : '', code: typeof code === 'string' ? code.trim() : '' };
};

async function requestAccountVerification(c: C, email: string) {
	if (!canSendProof(c.env)) return c.json({ error: 'Email verification is temporarily unavailable.' }, 503);
	try {
		await sendEmailProof(c.env, 'account', email, email);
	} catch {
		// Keep account existence and mail delivery details out of public responses.
		console.error('Account email verification delivery failed');
	}
	return c.json({ verifyEmail: true }, 202, { 'Cache-Control': 'no-store' });
}

authRoute.post('/signup', async (c) => {
	if (!isCloud(c.env)) return c.json({ error: 'Sign-up is only on Hosted Cloud.' }, 404);
	if (c.env.ENVIRONMENT === 'production' && !c.env.SIGNUP_LIMITER) return c.json({ error: 'Sign-up rate limiting is not configured.' }, 503);
	// Each verified sign-up is a fresh trial. Production requires the rate limiter binding.
	if (c.env.SIGNUP_LIMITER && !(await c.env.SIGNUP_LIMITER.limit({ key: c.req.header('cf-connecting-ip') || 'unknown' })).success) {
		return c.json({ error: 'Too many sign-ups from this network. Wait a minute and try again.' }, 429);
	}
	const { email, password, code } = await credentials(c);
	if (!EMAIL.test(email) || email.length > 254) return c.json({ error: 'Enter a valid email.' }, 400);
	if (password.length < 10 || password.length > 200) return c.json({ error: 'Use a password of at least 10 characters.' }, 400);
	if (!code) {
		const existing = await c.env.DB.prepare('SELECT 1 FROM accounts WHERE email = ?').bind(email).first();
		if (existing) return canSendProof(c.env)
			? c.json({ verifyEmail: true }, 202, { 'Cache-Control': 'no-store' })
			: c.json({ error: 'Email verification is temporarily unavailable.' }, 503);
		// Mail delivery runs out of band so signup timing does not expose registered accounts.
		if (!canSendProof(c.env)) return c.json({ error: 'Email verification is temporarily unavailable.' }, 503);
		c.executionCtx.waitUntil(sendEmailProof(c.env, 'account', email, email).catch(() => console.error('Account email verification delivery failed')));
		return c.json({ verifyEmail: true }, 202, { 'Cache-Control': 'no-store' });
	}
	if (!(await redeemEmailProof(c.env.DB, 'account', email, code))) return c.json({ error: 'Invalid or expired verification code.' }, 400);
	const id = crypto.randomUUID();
	const [res] = await c.env.DB.batch([
		c.env.DB.prepare('INSERT INTO accounts (id, email, password_hash, trial_ends_at) VALUES (?, ?, ?, ?) ON CONFLICT (email) DO NOTHING')
			.bind(id, email, await hashPassword(password), now() + TRIAL_DAYS * 86400),
		c.env.DB.prepare('INSERT INTO verified_accounts SELECT id FROM accounts WHERE id = ?').bind(id),
	]);
	if (!res?.meta.changes) return c.json({ error: 'That email already has an account. Sign in instead.' }, 409);
	await startSession(c, id);
	return c.json({ ok: true }, 201);
});

async function accountLogin(c: C) {
	const { email, password, code } = await credentials(c);
	if (!email || !password || password.length > 200) return c.json({ error: 'Wrong email or password.' }, 401);
	const row = await c.env.DB.prepare('SELECT a.id, a.password_hash, v.account_id AS verified FROM accounts a LEFT JOIN verified_accounts v ON v.account_id = a.id WHERE a.email = ?').bind(email).first<{ id: string; password_hash: string; verified: string | null }>();
	const matched = await verifyPassword(password, row?.password_hash ?? `pbkdf2$${ITERATIONS}$00000000000000000000000000000000$${'0'.repeat(64)}`);
	if (!row || !matched) return c.json({ error: 'Wrong email or password.' }, 401);
	if (!row.verified) {
		if (!code) return requestAccountVerification(c, email);
		if (!(await redeemEmailProof(c.env.DB, 'account', email, code))) return c.json({ error: 'Invalid or expired verification code.' }, 400);
		await c.env.DB.prepare('INSERT INTO verified_accounts VALUES (?) ON CONFLICT DO NOTHING').bind(row.id).run();
	}
	await c.env.DB.prepare('DELETE FROM account_sessions WHERE expires_at <= ?').bind(now()).run();
	await startSession(c, row.id);
	return c.json({ ok: true });
}
