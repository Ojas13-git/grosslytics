# How to Track Polar & Dodo Payments Revenue by Channel

> Canonical URL: https://grosslytics.com/blog/polar-dodo-payments-analytics/ | Updated: 2026-11-24

Send the Grosslytics visitor ID in each Merchant of Record's own parameter (`reference_id` for Polar links, `metadata_visitor_id` for Dodo links, and `checkout[custom][visitor_id]` for Lemon Squeezy links) and point signed payment webhooks at Grosslytics. Every verified order then credits the exact campaign, post, or AI search answer that brought the customer.

**Lemon Squeezy is winding down.** It closed new store sign-ups on November 16, 2026, and plans to stop processing payments on March 31, 2027. The Lemon Squeezy steps below apply to existing stores migrating or tracking remaining renewals; see [Lemon Squeezy's migration guide](https://docs.lemonsqueezy.com/migration).

## Key takeaways

- Always send marketing traffic to a page running `g.js` before checkout; linking directly from social posts to a hosted checkout skips the visit record.
- Use each provider's native metadata key (`reference_id` on Polar, `metadata.visitor_id` on Dodo, `custom_data.visitor_id` on Lemon Squeezy).
- Polar records `billing_reason: "subscription_cycle"` as a renewal; Dodo handles full refunds via `refund.succeeded`.
- Compare gateway fee rates (4% + $0.40 for Dodo vs 5% for Polar) in our [payment fee calculator](/tools/payment-fee-calculator/).

## What does channel attribution need from a Merchant of Record?

A Merchant of Record handles global tax compliance and invoicing, but it cannot see which blog post or ChatGPT answer drove the click unless your website records the visit and forwards a visitor ID into checkout.

## Step 1: How do you record the source before checkout?

Install `g.js` on your landing and pricing pages and route campaign links through your own domain first:

```html
<script defer src="https://grosslytics.com/g.js"
  data-site-id="YOUR_SITE_ID"></script>
```

Example campaign URL:

```text
https://your-site.example/pricing?utm_source=x&utm_medium=social&utm_campaign=launch-post-1
```

If a social bio or post links straight to `buy.polar.sh` or `checkout.dodopayments.com`, no Grosslytics visit exists to match the eventual webhook. See the [tracker installation reference](/docs/#install) for Content Security Policy settings and self-hosted origins.

## Step 2: Which identity field does each provider expect?

Grosslytics decorates supported anchor links automatically when the parameter is absent and leaves any existing reference intact. For server-created checkout sessions or JavaScript redirects, read `localStorage.getItem('gl_vid')` and pass the provider-specific field below:

| Provider | Automatic anchor-link parameter | Server / API checkout field | Webhook field parsed by Grosslytics |
| --- | --- | --- | --- |
| Polar | `reference_id` on `buy.polar.sh` or `polar.sh` | `metadata.visitor_id` | `data.metadata.visitor_id` or `data.metadata.reference_id` |
| Dodo Payments | `metadata_visitor_id` on `checkout.dodopayments.com` | `metadata.visitor_id` | `data.metadata.visitor_id` |
| Lemon Squeezy | `checkout[custom][visitor_id]` on `*.lemonsqueezy.com` | `checkout_data.custom.visitor_id` | `meta.custom_data.visitor_id` |

### Polar checkout links and sessions

Use persistent Polar Checkout Links rather than copying temporary Checkout Session URLs, or pass `metadata.visitor_id` when calling `polar.checkouts.create()`. [Source: Polar Checkout Links](https://polar.sh/docs/features/checkout/links).

<figure>
  <a href="/images/comparisons/polar-2026-11-08-fd34a928ab51.jpg" aria-label="Open full-size Polar screenshot">
    <img src="/images/comparisons/polar-2026-11-08-fd34a928ab51.jpg" alt="Polar checkout-link documentation showing reference_id and UTM metadata parameters." width="1265" height="712" loading="lazy" decoding="async" />
  </a>
  <figcaption>Public Polar documentation showing reference metadata carried by a checkout link. Captured 2026-11-08. <a href="https://polar.sh/docs/features/checkout/links#attribution-and-reference-metadata">Source: Polar</a>.</figcaption>
</figure>

```js
// Server: polar is your initialized SDK client; body is a validated request.
const visitorId = typeof body.visitorId === 'string'
  && /^[A-Za-z0-9_-]{1,200}$/.test(body.visitorId)
  ? body.visitorId : null;

const checkout = await polar.checkouts.create({
  products: [process.env.POLAR_PRODUCT_ID],
  successUrl: 'https://your-site.example/thanks',
  metadata: visitorId ? { visitor_id: visitorId } : {}
});
```

### Dodo Payments checkout sessions

For Dodo Payments links on your page, `g.js` appends `metadata_visitor_id` automatically. When creating sessions on your server, pass `metadata.visitor_id`. [Source: Dodo Checkout Sessions](https://docs.dodopayments.com/developer-resources/checkout-session).

<figure>
  <a href="/images/comparisons/dodo-payments-2026-11-08-a5625ca79e8a.jpg" aria-label="Open full-size Dodo Payments screenshot">
    <img src="/images/comparisons/dodo-payments-2026-11-08-a5625ca79e8a.jpg" alt="Dodo Payments developer documentation showing the checkout session metadata object for passing visitor IDs." width="1265" height="712" loading="lazy" decoding="async" />
  </a>
  <figcaption>Public Dodo Payments documentation showing the checkout metadata field; this is a documentation view, not a merchant account. Captured 2026-11-08. <a href="https://docs.dodopayments.com/developer-resources/checkout-session#param-metadata">Source: Dodo Payments</a>.</figcaption>
</figure>

```js
// Server: client is your initialized DodoPayments SDK client.
const visitorId = typeof body.visitorId === 'string'
  && /^[A-Za-z0-9_-]{1,200}$/.test(body.visitorId)
  ? body.visitorId : null;

const session = await client.checkoutSessions.create({
  product_cart: [{ product_id: process.env.DODO_PRODUCT_ID, quantity: 1 }],
  return_url: 'https://your-site.example/thanks',
  metadata: visitorId ? { visitor_id: visitorId } : {}
});
```

### Lemon Squeezy checkout links

For existing Lemon Squeezy stores using JavaScript redirects, append `checkout[custom][visitor_id]` before redirecting, or set `checkout_data.custom.visitor_id` via API. [Source: Lemon Squeezy custom data](https://docs.lemonsqueezy.com/help/checkout/passing-custom-data).

```js
// Browser: run after the Grosslytics tracker has initialized.
let visitorId = null;
try { visitorId = localStorage.getItem('gl_vid'); } catch {}
const checkout = new URL('https://YOUR_STORE.lemonsqueezy.com/checkout/buy/YOUR_VARIANT');
if (visitorId) checkout.searchParams.set('checkout[custom][visitor_id]', visitorId);
window.location.assign(checkout.href);
```

<figure>
  <a href="/images/comparisons/lemon-squeezy-2026-11-08-8919f4f59270.jpg" aria-label="Open full-size Lemon Squeezy screenshot">
    <img src="/images/comparisons/lemon-squeezy-2026-11-08-8919f4f59270.jpg" alt="Lemon Squeezy documentation showing checkout custom-data URL parameters for attribution." width="1265" height="712" loading="lazy" decoding="async" />
  </a>
  <figcaption>Public Lemon Squeezy documentation illustrating how custom data is included in checkout links. Captured 2026-11-08. <a href="https://docs.lemonsqueezy.com/help/checkout/passing-custom-data#passing-custom-data-in-checkout-links">Source: Lemon Squeezy</a>.</figcaption>
</figure>

## Step 3: Which webhook events should reach Grosslytics?

Point each provider's signed webhook destination at its dedicated Grosslytics endpoint and save the signing secret in Payments settings:

```text
https://YOUR_ANALYTICS_DOMAIN/api/webhooks/polar?siteId=YOUR_SITE_ID
https://YOUR_ANALYTICS_DOMAIN/api/webhooks/dodo?siteId=YOUR_SITE_ID
https://YOUR_ANALYTICS_DOMAIN/api/webhooks/lemonsqueezy?siteId=YOUR_SITE_ID
```

| Provider | Payment events ingested | Refund coverage | Signature verification |
| --- | --- | --- | --- |
| Polar | `order.paid` | Manual reconciliation | Standard Webhooks headers |
| Dodo Payments | `payment.succeeded` | `refund.succeeded` (full refunds) | Standard Webhooks headers |
| Lemon Squeezy | `order_created`, `subscription_payment_success` | Manual reconciliation | `X-Signature` HMAC |

Always verify signatures against the raw unmodified request body ([Lemon Squeezy signing docs](https://docs.lemonsqueezy.com/help/webhooks/signing-requests)) and configure your site currency in the [payment integration reference](/docs/#payments).

## How do renewals, tax deductions, and fees differ?

Grosslytics strips reported sales tax before calculating net revenue and applies each provider's published fee schedule (5.0% for Polar, 4.0% + $0.40 for Dodo, 5.0% + $0.50 for Lemon Squeezy).

For example, a $120 Dodo payment with $20 tax leaves $100 gross revenue after tax and $95.20 net revenue after Dodo's estimated $4.80 fee.

- **Polar renewals:** `billing_reason: "subscription_cycle"` marks recurring charges as renewals ([Polar order webhooks](https://polar.sh/docs/api-reference/webhooks/order.created)).
- **Lemon Squeezy subscriptions:** The initial subscription payment can emit both `order_created` and `subscription_payment_success` ([Lemon Squeezy event sequence](https://docs.lemonsqueezy.com/help/webhooks/event-types)). If you enable both events, inspect your first subscription transaction so you do not double-count the initial invoice.
- **Dodo renewals:** Currently recorded as sales alongside one-time payments without a separate renewal flag.

If you are migrating from Lemon Squeezy to Paddle or Stripe, compare setup steps in our [Paddle attribution guide](/blog/paddle-revenue-attribution/) and [DataFast vs DataBull comparison](/compare/datafast-vs-databull/).

## How should you verify your first attributed sale?

Run a test payment from a tagged URL in a fresh browser session and inspect the response status and recorded sale:

| Webhook outcome | What to check |
| --- | --- |
| Sale appears as Unattributed | Compare browser `gl_vid` with `metadata.visitor_id` or `reference_id` in the webhook payload |
| Endpoint returns `401` | Verify the signing secret in Payments settings matches the provider endpoint |
| Endpoint returns `422` | Match your site reporting currency to the charge currency |
| Endpoint returns `200` with `ignored` or `deduplicated` | Payment event was already processed or event type is outside the supported list |

Compare first-touch, last-touch, and linear attribution in the [dashboard definitions](/docs/#dashboard), and see a full end-to-end sandbox trace in our [ChatGPT revenue walkthrough](/blog/track-chatgpt-traffic-revenue/#what-happened-when-we-tested-it).

## Frequently asked questions

### Can I use checkout[custom][visitor_id] for Polar and Dodo too?

No. `checkout[custom][visitor_id]` is specific to Lemon Squeezy. Polar links use `reference_id`, Dodo links use `metadata_visitor_id`, and server checkout sessions pass `metadata.visitor_id`.

### Does Grosslytics handle Polar or Dodo refunds?

Dodo Payments full refunds delivered via `refund.succeeded` automatically remove the sale from revenue and mark it refunded, while partial Dodo refunds stay in revenue. Polar and Lemon Squeezy refunds currently require manual reconciliation.

### Does Grosslytics classify Dodo subscription renewals separately?

Not yet. Dodo's `payment.succeeded` handler credits recurring payments to the original visitor's channel, though they currently count under new sales rather than a separate renewal bucket.

### How does Grosslytics compare to DataBull for Dodo Payments?

Both support Stripe, Polar, and Dodo Payments on your own Cloudflare account; Grosslytics is open-source (AGPL-3.0), deducts gateway fees automatically, and adds Paddle, Razorpay, PayPal, Cashfree, Gumroad, and RevenueCat. See the full breakdown in [DataBull alternatives](/compare/databull-alternative/).
