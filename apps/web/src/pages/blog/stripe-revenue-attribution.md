---
layout: "../../layouts/Article.astro"
title: "How to Track Stripe Revenue by Traffic Source"
description: "Connect Stripe Checkout and Payment Links to visitor sources, configure signed webhooks, and track fees, renewals, and refunds in Grosslytics."
primaryKeyword: "stripe revenue attribution analytics"
format: "how-to"
visualReview: {"decision":"include-screenshots","reason":"Real public provider documentation screenshots explain the checkout identity fields; demo views are labeled and do not imply a live payment test."}
updatedDate: "2026-11-24"
pubDate: "2026-11-08"
---

I recommend carrying the tracked visitor ID into Stripe Checkout as `client_reference_id` and matching verified payment events to that visitor in Grosslytics. Payment Links are decorated automatically by `g.js`, while server-created Checkout Sessions pass the ID via metadata so initial sales, renewals, and full refunds tie back to the exact traffic source.

## Key takeaways

- Keep the same visitor ID (`gl_vid`) on the landing page and the Stripe checkout; a UTM on the success page alone loses the first-touch channel.
- Payment Links use `client_reference_id`; server-created subscriptions should also attach `visitor_id` to `subscription_data.metadata` for renewal invoices.
- Configure snapshot webhook payloads in Stripe and test both initial checkouts and subscription renewals against your webhook API version.
- Grosslytics estimates Stripe fees using the standard schedule (previewable in the [payment fee calculator](/tools/payment-fee-calculator/)) and deducts full refunds automatically.

## What do you need before connecting Stripe?

You need a tracked website, a Grosslytics site ID, a working Stripe checkout, and a reachable webhook endpoint.

This guide follows Stripe's documentation and the Grosslytics webhook handler. Before turning it on for production traffic, run one test-mode purchase and inspect the recorded source in your dashboard.

1. Add your site in the [Grosslytics setup wizard](/start/).
2. Set the site's reporting currency to match your Stripe charges.
3. Choose Payment Links or server-created Checkout Sessions.
4. Confirm your Grosslytics API URL is reachable by Stripe webhooks.
5. Keep Stripe test mode enabled until one purchase attributes cleanly.

See the [tracker installation guide](/docs/#install) for Content Security Policy headers and self-hosted API routing. If you are comparing tools for Stripe attribution, see how Grosslytics stacks up in our [DataFast alternatives guide](/compare/datafast-alternative/).

## Step 1: How do you record the visit and carry its identity?

Install `g.js` on your acquisition pages so every visit generates a visitor ID before the user clicks checkout.

```html
<script defer src="https://grosslytics.com/g.js"
  data-site-id="YOUR_SITE_ID"></script>

<a href="https://buy.stripe.com/YOUR_PAYMENT_LINK">Subscribe</a>
```

Replace the placeholders and, when self-hosting, point `src` to your own analytics hostname. Grosslytics appends `client_reference_id` to Stripe Payment Link anchors automatically when that parameter is absent, leaving any existing `client_reference_id` intact.

For server-created Checkout Sessions, read the visitor ID from browser storage after `g.js` loads and send it with your checkout request:

```js
// Browser: run from your checkout button after the page loads.
let visitorId = null;
try { visitorId = localStorage.getItem('gl_vid'); } catch {}

const response = await fetch('/api/checkout', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ visitorId })
});
if (!response.ok) throw new Error('Checkout could not be created.');
const { url } = await response.json();
window.location.assign(url);
```

If `gl_vid` is unavailable (for example, strict storage blocking), let checkout proceed so you never block a customer purchase.

## Step 2: How do you attach the ID to Stripe Checkout?

For Payment Links, inspect the decorated URL on hover; for server-created sessions, pass `client_reference_id` and `metadata.visitor_id` explicitly.

Stripe passes `client_reference_id` to `checkout.session.completed`, which handles the initial purchase. For recurring subscriptions, also set `subscription_data.metadata` so downstream renewal invoices stay linked to the buyer. [Source: Stripe Payment Link URL parameters](https://docs.stripe.com/payment-links/url-parameters).

<figure>
  <a href="/images/comparisons/stripe-2026-11-08-2e93d133b219.jpg" aria-label="Open full-size Stripe screenshot">
    <img src="/images/comparisons/stripe-2026-11-08-2e93d133b219.jpg" alt="Stripe documentation showing client_reference_id for Payment Link reconciliation." width="1280" height="720" loading="lazy" decoding="async" />
  </a>
  <figcaption>Public Stripe documentation for the client reference field used to connect a Payment Link checkout to a visitor. Captured 2026-11-08. <a href="https://docs.stripe.com/payment-links/url-parameters#streamline-reconciliation-with-a-url-parameter">Source: Stripe</a>.</figcaption>
</figure>

Inside your server checkout endpoint:

```js
// Server only: inside your authenticated checkout route.
const visitorId = typeof body.visitorId === 'string'
  && /^[A-Za-z0-9_-]{1,200}$/.test(body.visitorId)
  ? body.visitorId : null;

const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  line_items: [{ price: process.env.STRIPE_RECURRING_PRICE_ID, quantity: 1 }],
  success_url: 'https://your-site.example/thanks?session_id={CHECKOUT_SESSION_ID}',
  cancel_url: 'https://your-site.example/pricing',
  ...(visitorId ? {
    client_reference_id: visitorId,
    metadata: { visitor_id: visitorId },
    subscription_data: { metadata: { visitor_id: visitorId } }
  } : {})
});
// Return session.url to the browser from your framework's response handler.
```

For a one-time payment, switch `mode` to `'payment'` and omit `subscription_data`. [Source: Stripe Checkout Session API](https://docs.stripe.com/api/checkout/sessions/create).

Stripe places subscription metadata on invoices under `parent.subscription_details.metadata` in newer API versions. Grosslytics reads `invoice.metadata` and `subscription_details.metadata`, and falls back to matching returning buyers by email if metadata is absent. [Source: Stripe metadata propagation](https://docs.stripe.com/metadata).

## Step 3: Which webhook events should you configure?

Send signed snapshot events to the Grosslytics Stripe endpoint and save that destination's signing secret in Payments settings.

```text
https://YOUR_ANALYTICS_DOMAIN/api/webhooks/stripe?siteId=YOUR_SITE_ID
```

| Event | What Grosslytics records | What to verify |
| --- | --- | --- |
| `checkout.session.completed` | Records the initial checkout when `payment_status` is `paid` | Visitor reference and net amount |
| `invoice.paid` | Records invoice payments and marks `subscription_cycle` as renewal | Metadata shape and no duplicate initial charge |
| `invoice_payment.paid` | Links invoice and PaymentIntent IDs | Matching invoice association |
| `charge.refunded` | Deducts full refunds from channel revenue | Refund reflected in red on dashboard |

Select Stripe's snapshot event payload format (not thin payloads) because Grosslytics reads the expanded `data.object` payload. [Source: Stripe webhook configuration](https://docs.stripe.com/webhooks).

Grosslytics ignores unpaid sessions and does not currently ingest `checkout.session.async_payment_succeeded` for delayed payment methods such as ACH or SEPA debit.

## How do you verify Stripe revenue attribution end to end?

Test one tagged visit through Stripe checkout and reconcile the recorded sale against your Stripe Dashboard event log.

Open a tagged URL in a fresh browser window:

```text
https://your-site.example/blog/track-chatgpt-traffic-revenue/?utm_source=newsletter&utm_medium=email&utm_campaign=launch
```

Complete a test purchase in the same browser, then verify that the sale credits `newsletter`, matches your site currency, and updates cleanly across first-touch, last-touch, and linear views. For a full worked sandbox run with `utm_source=chatgpt.com`, see our [ChatGPT revenue tracking walkthrough](/blog/track-chatgpt-traffic-revenue/).

<figure>
  <a href="/images/comparisons/grosslytics-public-demo-2026-11-08.jpg" aria-label="Open full-size Grosslytics screenshot">
    <img src="/images/comparisons/grosslytics-public-demo-2026-11-08.jpg" alt="Grosslytics public demo showing first-touch net revenue, a daily chart and source reports." width="1010" height="1209" loading="lazy" decoding="async" />
  </a>
  <figcaption>Grosslytics public demo with sample data. Captured November 8, 2026. <a href="https://grosslytics.com/app/demo">View source page</a>.</figcaption>
</figure>

The [dashboard definitions](/docs/#dashboard) explain first touch, last touch, and the 50/50 linear split. Because a buyer can read multiple pages before paying, per-page revenue counts each page that participated in the journey rather than splitting a single sale exclusively across pages.

## How does Grosslytics calculate net Stripe revenue?

Grosslytics removes reported sales tax first, then deducts its default Stripe fee schedule (2.9% + $0.30) to show net channel revenue without manual spreadsheets.

For a $100 charge with no tax, Grosslytics records $3.20 in estimated fees and $96.80 in net revenue:

```text
estimated_fee = round(10000 * 290 / 10000) + 30 = 320 cents
net_after_estimated_fee = 10000 - 320 = 9680 cents
```

Because international cards, currency conversion, and Stripe Billing fees vary by region and contract, reconcile totals against your Stripe payout reports before accounting. Each Grosslytics site reports in one currency (USD, EUR, GBP, or INR) and rejects payments in other currencies rather than converting them. You can model fee impacts across gateways with the [SaaS payment fee calculator](/tools/payment-fee-calculator/) or see how this differs from event-only tools in our [Plausible revenue comparison](/compare/plausible-alternative/).

## What should you check when a Stripe payment is unattributed?

Walk through this checklist whenever a recorded Stripe sale appears under Unattributed:

1. Confirm `g.js` returned `202 Accepted` on the landing page (check Content Security Policy headers).
2. Inspect the Checkout link or `checkout.sessions.create` payload for `client_reference_id` or `metadata.visitor_id`.
3. Verify the webhook signing secret in Grosslytics matches the Stripe endpoint secret.
4. Check whether the Stripe webhook API version uses `parent.subscription_details.metadata` for renewals.
5. Confirm the payment currency matches the site's reporting currency (mismatches return `HTTP 422`).
6. Test in a normal browser tab rather than WebDriver automation, which `g.js` filters as a bot.

Review the [payment integration reference](/docs/#payments) for all supported Stripe parameters and webhook endpoints.

## Frequently asked questions

### Does client_reference_id automatically track every renewal?

No. It links the initial Checkout Session. Add `visitor_id` to `subscription_data.metadata` (or rely on email matching for returning customers) so subsequent `invoice.paid` events credit the original source.

### Does Grosslytics work with Stripe Payment Links without backend code?

Yes. When `g.js` runs on your site, it appends `?client_reference_id=<visitor_id>` to any `buy.stripe.com` link automatically, and Stripe includes that value in the `checkout.session.completed` webhook.

### Does Grosslytics read my exact Stripe processing fee?

Grosslytics estimates Stripe fees using the standard 2.9% + $0.30 schedule after removing sales tax, so international or custom-rate accounts should reconcile exact payouts in Stripe.

### Are all Stripe payment methods covered by these events?

Instant methods (cards, Apple Pay, Google Pay, Link) complete inside `checkout.session.completed` with `payment_status: "paid"`. Delayed methods such as ACH or SEPA that settle asynchronously via `checkout.session.async_payment_succeeded` are not ingested yet.
