# How to Attribute Razorpay Payments to Traffic Sources

> Canonical URL: https://grosslytics.com/blog/razorpay-revenue-attribution/ | Updated: 2026-11-24

Attach the Grosslytics visitor ID (`gl_vid`) inside Razorpay Standard Checkout `notes.visitor_id` and point Razorpay's `payment.captured` webhook at your Grosslytics endpoint. That links every captured INR or international payment back to the exact UTM campaign, blog post, or AI search answer that brought the buyer.

## Key takeaways

- Pass `visitor_id` in the Standard Checkout `notes` object so `payload.payment.entity.notes.visitor_id` reaches the webhook.
- Subscribe to `payment.captured` in Razorpay Webhooks; browser success callbacks and authorized-only events are not ingested.
- Set your Grosslytics site reporting currency to `INR` when charging in rupees, because mismatched currencies are rejected.
- Neither DataFast nor DataBull natively supports Razorpay; see how Grosslytics compares in [DataFast vs DataBull vs Grosslytics](/compare/datafast-vs-databull/).

## What do you need before connecting Razorpay?

You need a Grosslytics site configured in your charge currency, `g.js` running on your acquisition pages, and Razorpay Orders with Standard Checkout.

1. Add your site through the [Grosslytics setup flow](/start/).
2. Select `INR` (or your settlement currency) when creating the site.
3. Install `g.js` on your landing and pricing pages.
4. Keep your existing server order creation and signature verification route ready.
5. Enable Razorpay Test Mode for an end-to-end check before going live.

## Step 1: How do you capture the visitor and campaign?

Install the tracker on your pages so `g.js` records UTM tags and stores `gl_vid` in `localStorage` before checkout starts.

```html
<script defer src="https://grosslytics.com/g.js"
  data-site-id="YOUR_SITE_ID"></script>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

Send marketing traffic to a tracked URL rather than a direct hosted payment link:

```text
https://your-site.example/pricing?utm_source=newsletter&utm_medium=email&utm_campaign=saas-launch
```

When the buyer clicks checkout, read `localStorage.getItem('gl_vid')`. If storage is blocked, let the checkout continue cleanly without passing a visitor ID. See the [tracker documentation](/docs/#install) for Content Security Policy rules and self-hosting.

## Step 2: Where should notes.visitor_id be attached?

Include `visitor_id` in both your server-side `razorpay.orders.create` call and the client-side Razorpay Checkout `notes` option.

Grosslytics reads `payload.payment.entity.notes.visitor_id` from the captured payment webhook. Passing `notes` on the checkout options guarantees the captured payment entity carries the field. [Source: Razorpay Orders API](https://razorpay.com/docs/api/orders/create) and [Standard Checkout steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps).

<figure>
  <a href="/images/comparisons/razorpay-2026-11-08-d36efcde0745.jpg" aria-label="Open full-size Razorpay screenshot">
    <img src="/images/comparisons/razorpay-2026-11-08-d36efcde0745.jpg" alt="Razorpay integration documentation showing the client-side Checkout setup section." width="1265" height="712" loading="lazy" decoding="async" />
  </a>
  <figcaption>Public Razorpay Standard Checkout instructions distinguishing the client checkout callback from the webhook URL. Captured 2026-11-08. <a href="https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps#2-integrate-with-checkout-on-client-side">Source: Razorpay</a>.</figcaption>
</figure>

On your server order-creation endpoint:

```js
// Server only: body comes from your validated checkout request.
const visitorId = typeof body.visitorId === 'string'
  && /^[A-Za-z0-9_-]{1,200}$/.test(body.visitorId)
  ? body.visitorId : null;

const order = await razorpay.orders.create({
  amount: 50000, // 500 INR in paise; select the price on the server.
  currency: 'INR',
  receipt: crypto.randomUUID(),
  notes: visitorId ? { visitor_id: visitorId } : {}
});
```

Then pass `visitorId` from the browser into `new Razorpay({ notes })`:

```js
// Browser: run after tracker and Razorpay Checkout have loaded.
let visitorId = null;
try { visitorId = localStorage.getItem('gl_vid'); } catch {}

const response = await fetch('/api/create-razorpay-order', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ visitorId })
});
if (!response.ok) throw new Error('Unable to create an order.');
const order = await response.json();

const checkout = new Razorpay({
  key: 'YOUR_PUBLIC_RAZORPAY_KEY_ID',
  order_id: order.id,
  amount: order.amount,
  currency: order.currency,
  notes: visitorId ? { visitor_id: visitorId } : {},
  handler: existingVerifiedPaymentHandler
});
checkout.open();
```

## Step 3: Which webhook event updates Grosslytics?

Configure Razorpay to send signed `payment.captured` webhooks to your Grosslytics Razorpay endpoint and store the webhook secret in Payments settings.

```text
https://YOUR_ANALYTICS_DOMAIN/api/webhooks/razorpay?siteId=YOUR_SITE_ID
```

Grosslytics verifies the `X-Razorpay-Signature` HMAC against the raw request body using your configured secret and deduplicates repeated deliveries by payment ID. [Source: Razorpay payment webhook events](https://razorpay.com/docs/webhooks/payments) and [webhook validation](https://razorpay.com/docs/webhooks/validate-test).

| Payment flow | How `visitor_id` reaches Grosslytics | Current support and limits |
| --- | --- | --- |
| Orders + Standard Checkout | `notes.visitor_id` on payment entity | Fully supported via `payment.captured` |
| Razorpay Payment Links | Must propagate `notes.visitor_id` manually | No automatic link decoration in `g.js` |
| Subscriptions | Pass `notes.visitor_id` per charge | Recorded as new sales; renewal flag not yet separated |

See the [payment integration reference](/docs/#payments) for endpoint configuration.

## How does Grosslytics handle Razorpay fees and currencies?

Grosslytics requires the Razorpay charge currency to match your site's reporting currency and deducts a 2.0% domestic fee estimate.

For an illustrative INR 500 payment (50,000 paise), Grosslytics records INR 10 in estimated fees and INR 490 in net revenue:

```text
payment = 50000 paise
estimated_fee = round(50000 * 200 / 10000) = 1000 paise
net_after_estimated_fee = 50000 - 1000 = 49000 paise
```

Because Razorpay GST on fees and international card rates vary by payment method, treat the 2.0% rate as an operational estimate and reconcile final payouts against Razorpay settlements. Model how processor fees impact margins with the [payment fee calculator](/tools/payment-fee-calculator/). Note that Razorpay refunds are not deducted automatically yet, and sending an INR charge to a USD-configured site returns `HTTP 422`.

## Pre-launch validation steps

Complete one Razorpay Test Mode purchase from a tagged visit before relying on production numbers:

1. Visit your pricing page with `?utm_source=test&utm_medium=cpc` in an ordinary browser.
2. Confirm `g.js` fires `/api/event` and gets `202 Accepted`.
3. Complete a test Standard Checkout payment and inspect the `payment.captured` webhook payload for `notes.visitor_id`.
4. Confirm the sale credits `test` in Grosslytics with the expected INR amount.
5. Replay the webhook in Razorpay and confirm Grosslytics deduplicates the payment ID.

Compare attribution views in the [dashboard definitions](/docs/#dashboard), or compare Grosslytics against other tools that handle Indian and global payment stacks in [5 Best DataBull Alternatives](/compare/databull-alternative/).

## Frequently asked questions

### Are Razorpay Payment Links automatically decorated?

No. Unlike Stripe Payment Links and Polar links, `g.js` does not rewrite `rzp.io` links automatically. Pass `notes.visitor_id` through your own checkout order or Payment Link API integration.

### Does Grosslytics convert INR to USD automatically?

No. Each site reports in a single currency (USD, EUR, GBP, or INR) so exchange-rate fluctuations never distort revenue trends. Set the site currency to INR for Razorpay INR checkouts.

### Are Razorpay subscription renewals separated from new sales?

Not yet. Captured subscription charges appear as recorded sales attributed to the matching visitor, while subscription renewal classification (`new` vs `renewal`) is currently implemented for Stripe, Paddle, Polar, Lemon Squeezy, and RevenueCat.

### Are Razorpay refunds reflected automatically?

Not yet. Automatic full refund deduction currently supports Stripe, Paddle, Dodo Payments, and Gumroad; reconcile Razorpay refunds against your Razorpay Dashboard.
