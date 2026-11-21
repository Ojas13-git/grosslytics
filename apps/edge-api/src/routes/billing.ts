import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Bindings } from '../env.js';
import { verifyStandardWebhook, verifyWebhook } from '../verify.js';
import { mintLicense } from './license.js';
import { isCloud } from '../cloud.js';

/**
 * Grosslytics' own billing (not a customer's payments): Hosted Cloud subscriptions, and Lifetime licenses (see license.ts). Dodo Payments (/dodo) is the live
 * gateway; /stripe stays for Stripe Payment Links opened with `client_reference_id=<account id>`. No Stripe API key is needed:
 * checkout and the customer portal are Stripe-hosted links, and this webhook turns accounts on and off.
 */
export const billingRoute = new Hono<{ Bindings: Bindings }>();
billingRoute.use('*', bodyLimit({ maxSize: 512 * 1024 }));

const id = (x: unknown) => (typeof x === 'string' ? x : typeof (x as { id?: unknown })?.id === 'string' ? (x as { id: string }).id : null);
type Status = 'active' | 'past_due' | 'canceled';
type Provider = 'stripe' | 'dodo';

async function applySubscription(db: D1Database, provider: Provider, subscription: string, status: Status, occurredAt: number, periodEnd: number | null, customer: string | null, accountId: string | null = null): Promise<boolean> {
	const key = [provider, subscription] as const;
	const [, , result] = await db.batch([
		db.prepare(`INSERT INTO billing_subscriptions
		  (provider, subscription_id, status, occurred_at, period_end, customer_id, account_id, linked_at)
		  VALUES (?1, ?2, ?3, ?4, ?5, ?6,
		    COALESCE((SELECT id FROM accounts WHERE id = ?7),
		      (SELECT id FROM accounts WHERE stripe_subscription_id = ?2 ORDER BY id LIMIT 1)),
		    CASE WHEN EXISTS (SELECT 1 FROM accounts WHERE id = ?7) THEN ?4 ELSE 0 END)
		  ON CONFLICT (provider, subscription_id) DO UPDATE SET
		    status = CASE WHEN ${newerStatus} THEN excluded.status ELSE billing_subscriptions.status END,
		    occurred_at = MAX(excluded.occurred_at, billing_subscriptions.occurred_at),
		    period_end = CASE WHEN ${newerStatus} THEN COALESCE(excluded.period_end, billing_subscriptions.period_end) ELSE billing_subscriptions.period_end END,
		    customer_id = COALESCE(excluded.customer_id, billing_subscriptions.customer_id),
		    account_id = COALESCE(billing_subscriptions.account_id, excluded.account_id),
		    linked_at = CASE WHEN billing_subscriptions.account_id IS NULL THEN excluded.linked_at ELSE billing_subscriptions.linked_at END`)
			.bind(...key, status, occurredAt, periodEnd, customer, accountId),
		db.prepare(`INSERT INTO account_billing (account_id, provider, subscription_id, linked_at)
		  SELECT account_id, provider, subscription_id, linked_at FROM billing_subscriptions
		  WHERE provider = ?1 AND subscription_id = ?2 AND account_id IS NOT NULL
		  ON CONFLICT (account_id) DO UPDATE SET provider = excluded.provider, subscription_id = excluded.subscription_id, linked_at = excluded.linked_at
		  WHERE excluded.linked_at > account_billing.linked_at`).bind(...key),
		db.prepare(`UPDATE accounts SET status = s.status, current_period_end = s.period_end,
		  stripe_customer_id = COALESCE(s.customer_id, accounts.stripe_customer_id), stripe_subscription_id = s.subscription_id
		  FROM account_billing b JOIN billing_subscriptions s ON s.provider = b.provider AND s.subscription_id = b.subscription_id
		  WHERE accounts.id = b.account_id AND b.provider = ?1 AND b.subscription_id = ?2`).bind(...key),
	]);
	return !!result?.meta.changes;
}

const statusRank = (column: string) => `CASE ${column} WHEN 'canceled' THEN 2 WHEN 'past_due' THEN 1 ELSE 0 END`;
const newerStatus = `(excluded.occurred_at > billing_subscriptions.occurred_at OR
	(excluded.occurred_at = billing_subscriptions.occurred_at AND ${statusRank('excluded.status')} > ${statusRank('billing_subscriptions.status')}))`;

async function refundLicense(db: D1Database, provider: Provider, paymentRef: string) {
	await db.prepare('INSERT INTO license_refunds VALUES (?, ?) ON CONFLICT DO NOTHING').bind(provider, paymentRef).run();
}

/** Stripe subscription status → account status. Anything unknown (incomplete, paused…) stops ingest. */
export function accountStatus(stripeStatus: string): 'active' | 'past_due' | 'canceled' {
	if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'active';
	if (stripeStatus === 'past_due') return 'past_due';
	return 'canceled';
}

// POST /api/billing/stripe
billingRoute.post('/stripe', async (c) => {
	const secret = c.env.STRIPE_BILLING_WEBHOOK_SECRET;
	const body = await c.req.text();
	if (!secret || !(await verifyWebhook('stripe', secret, body, c.req.raw.headers))) return c.text('Invalid signature', 401);
	let event: { type?: string; created?: number; data?: { object?: Record<string, any> } };
	try {
		event = JSON.parse(body);
	} catch {
		return c.text('Invalid JSON', 400);
	}
	const o = event.data?.object ?? {};
	const db = c.env.DB;

	// Lifetime: a paid one-time checkout mints a license (the buyer collects it on /license)
	if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && o.mode === 'payment') {
		if (o.payment_status !== 'paid' || typeof o.id !== 'string') return c.json({ received: true, ignored: true });
		if (!c.env.LIFETIME_PAYMENT_LINK_ID) return c.text('LIFETIME_PAYMENT_LINK_ID is not set', 503);
		const payment = id(o.payment_intent);
		if (id(o.payment_link) !== c.env.LIFETIME_PAYMENT_LINK_ID || !payment) return c.json({ received: true, ignored: true });
		const minted = await mintLicense(c.env, 'stripe', o.id, payment, o.customer_details?.email ?? null);
		return minted ? c.json({ received: true, license: true }) : c.text('LICENSE_SECRET is not set', 503);
	}

	if (event.type === 'charge.refunded' && o.refunded === true && id(o.payment_intent)) {
		await refundLicense(db, 'stripe', id(o.payment_intent)!);
		return c.json({ received: true });
	}

	const occurredAt = event.created;
	if (!isCloud(c.env) || typeof occurredAt !== 'number' || !Number.isSafeInteger(occurredAt) || occurredAt <= 0) return c.json({ received: true, ignored: true });
	if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && o.mode === 'subscription') {
		const account = o.client_reference_id;
		const sub = id(o.subscription);
		if (typeof account !== 'string' || !sub || !['paid', 'no_payment_required'].includes(o.payment_status)) return c.json({ received: true, ignored: true });
		if (!c.env.CLOUD_STRIPE_PAYMENT_LINK_ID) return c.text('CLOUD_STRIPE_PAYMENT_LINK_ID is not set', 503);
		if (id(o.payment_link) !== c.env.CLOUD_STRIPE_PAYMENT_LINK_ID) return c.json({ received: true, ignored: true });
		return c.json({ received: true, matched: await applySubscription(db, 'stripe', sub, 'active', occurredAt, null, id(o.customer), account) });
	}

	if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
		const status = event.type === 'customer.subscription.deleted' ? 'canceled' : accountStatus(String(o.status));
		// Newer API versions put the period on each item
		const periodEnd = Number(o.items?.data?.[0]?.current_period_end ?? o.current_period_end) || null;
		if (typeof o.id !== 'string') return c.json({ received: true, ignored: true });
		return c.json({ received: true, matched: await applySubscription(db, 'stripe', o.id, status, occurredAt, periodEnd, id(o.customer)) });
	}
	return c.json({ received: true, ignored: true });
});

/** Dodo subscription event → account status. on_hold means a renewal failed and Dodo is retrying, so it keeps working like Stripe's past_due. */
const DODO_STATUS: Record<string, Status> = {
	'subscription.active': 'active',
	'subscription.renewed': 'active',
	'subscription.on_hold': 'past_due',
	'subscription.cancelled': 'canceled',
	'subscription.failed': 'canceled',
	'subscription.expired': 'canceled',
};

// POST /api/billing/dodo - Dodo Payments (Standard Webhooks). The checkout links carry `metadata_account_id` for Cloud.
billingRoute.post('/dodo', async (c) => {
	const secret = c.env.DODO_BILLING_WEBHOOK_SECRET;
	const body = await c.req.text();
	if (!secret || !(await verifyStandardWebhook(secret, body, c.req.raw.headers))) return c.text('Invalid signature', 401);
	let event: { type?: string; timestamp?: string; data?: Record<string, any> };
	try {
		event = JSON.parse(body);
	} catch {
		return c.text('Invalid JSON', 400);
	}
	const d = event.data ?? {};

	// Lifetime: a one-time payment mints a license; the buyer collects it on /license?payment_id=…
	if (event.type === 'payment.succeeded') {
		if (d.subscription_id || typeof d.payment_id !== 'string') return c.json({ received: true, ignored: true });
		const products: unknown[] = Array.isArray(d.product_cart) ? d.product_cart.map((p: { product_id?: unknown }) => p?.product_id) : [];
		if (!c.env.LIFETIME_PRODUCT_ID) return c.text('LIFETIME_PRODUCT_ID is not set', 503);
		if (!products.includes(c.env.LIFETIME_PRODUCT_ID)) return c.json({ received: true, ignored: true });
		const minted = await mintLicense(c.env, 'dodo', d.payment_id, d.payment_id, d.customer?.email ?? null);
		return minted ? c.json({ received: true, license: true }) : c.text('LICENSE_SECRET is not set', 503);
	}

	if (event.type === 'refund.succeeded' && d.is_partial === false && typeof d.payment_id === 'string') {
		await refundLicense(c.env.DB, 'dodo', d.payment_id);
		return c.json({ received: true });
	}

	const type = event.type ?? '';
	const occurredAt = Math.floor(Date.parse(event.timestamp ?? '') / 1000);
	if (isCloud(c.env) && Object.hasOwn(DODO_STATUS, type) && Number.isSafeInteger(occurredAt) && occurredAt > 0 && typeof d.subscription_id === 'string') {
		let account: string | null = null;
		if (type === 'subscription.active' && typeof d.metadata?.account_id === 'string') {
			if (!c.env.CLOUD_DODO_PRODUCT_ID) return c.text('CLOUD_DODO_PRODUCT_ID is not set', 503);
			if (d.product_id !== c.env.CLOUD_DODO_PRODUCT_ID) return c.json({ received: true, ignored: true });
			account = d.metadata.account_id;
		}
		const periodEnd = Math.floor(Date.parse(d.next_billing_date) / 1000) || null;
		return c.json({ received: true, matched: await applySubscription(c.env.DB, 'dodo', d.subscription_id, DODO_STATUS[type]!, occurredAt, periodEnd, id(d.customer?.customer_id), account) });
	}
	return c.json({ received: true, ignored: true });
});
