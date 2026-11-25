---
layout: "../../layouts/Article.astro"
title: "How to Track Paddle Revenue & Renewals by Source"
description: "Attribute Paddle Billing transactions and renewals to traffic sources using customData and signed webhooks. Covers full refunds, taxes, and fees."
primaryKeyword: "paddle revenue attribution"
format: "how-to"
visualReview: {"decision":"include-screenshots","reason":"Real public provider documentation screenshots explain the checkout identity fields; demo views are labeled and do not imply a live payment test."}
updatedDate: "2026-11-24"
pubDate: "2026-11-08"
---

Pass the Grosslytics visitor ID into Paddle Checkout as `customData.visitor_id` and point Paddle's `transaction.completed`, `adjustment.created`, and `adjustment.updated` webhooks at your Grosslytics endpoint. Paddle propagates that ID to subscriptions and future renewals, tying initial sales, recurring charges, and approved full refunds directly to each marketing source.

## Key takeaways

- Pass `customData.visitor_id` into `Paddle.Checkout.open()` and verify `custom_data.visitor_id` arrives on webhook payloads.
- Subscribe to `transaction.completed` for initial and recurring payments plus `adjustment.created` and `adjustment.updated` for approved full refunds.
- Grosslytics strips reported Paddle tax automatically and estimates Paddle's 5% + $0.50 fee schedule before attributing net revenue.
- Check both an initial checkout and one `subscription_recurring` event in sandbox before switching live traffic.

## What do you need before opening Paddle Checkout?

You need a Paddle Billing product and price, an initialized `Paddle.js` integration, and a Grosslytics site ID.

This walkthrough covers **Paddle Billing** (`transaction.completed` and `adjustment.*`), not legacy Paddle Classic. Start in the [Grosslytics setup wizard](/start/), add your domain, and pick the reporting currency matching your Paddle prices.

1. Install `g.js` on your marketing and pricing pages.
2. Initialize `Paddle.js` with your client-side token.
3. Configure a sandbox webhook destination in Paddle Developer Tools.
4. Plan to inspect both one initial purchase and one recurring renewal event.

Check the [tracker guide](/docs/#install) if you self-host or serve strict Content Security Policy headers. Looking for a Paddle-ready alternative to DataBull or DataFast? Compare them in [Best DataBull alternatives for Paddle & net revenue](/compare/databull-alternative/).

## Step 1: How do you pass the visitor ID into Paddle.js?

Read `localStorage.getItem('gl_vid')` after `g.js` loads and attach it inside `Paddle.Checkout.open({ customData })`.

```html
<script defer src="https://grosslytics.com/g.js"
  data-site-id="YOUR_SITE_ID"></script>
<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
```

In your browser checkout handler:

```js
// Browser: initialize once, then call openCheckout from your buy button.
Paddle.Environment.set('sandbox');
Paddle.Initialize({ token: 'test_YOUR_CLIENT_SIDE_TOKEN' });

function openCheckout() {
  let visitorId = null;
  try { visitorId = localStorage.getItem('gl_vid'); } catch {}
  Paddle.Checkout.open({
    items: [{ priceId: 'pri_YOUR_RECURRING_PRICE_ID', quantity: 1 }],
    ...(visitorId ? { customData: { visitor_id: visitorId } } : {})
  });
}
```

Switch `Paddle.Environment` and your token for production. If `gl_vid` is missing, checkout still opens normally without blocking the buyer. [Source: Paddle.Checkout.open parameters](https://developer.paddle.com/paddle-js/methods/paddle-checkout-open/).

Paddle copies transaction `customData` onto the created subscription and subsequent recurring transactions, where webhooks expose it under `custom_data.visitor_id`. [Source: Paddle custom-data propagation](https://developer.paddle.com/build/transactions/custom-data/).

<figure>
  <a href="/images/comparisons/paddle-2026-11-08-a31e49cd3ad1.jpg" aria-label="Open full-size Paddle screenshot">
    <img src="/images/comparisons/paddle-2026-11-08-a31e49cd3ad1.jpg" alt="Paddle documentation showing customData in the Checkout open method instructions." width="1265" height="712" loading="eager" decoding="async" />
  </a>
  <figcaption>Public Paddle documentation explaining customData on Paddle.Checkout.open. Captured 2026-11-08. <a href="https://developer.paddle.com/build/transactions/custom-data/#pass-custom-data-to-checkout">Source: Paddle</a>.</figcaption>
</figure>

## Step 2: Which Paddle webhook events should Grosslytics receive?

Subscribe your Grosslytics Paddle webhook URL to `transaction.completed`, `adjustment.created`, and `adjustment.updated`, and save the endpoint signing secret in Payments settings.

```text
https://YOUR_ANALYTICS_DOMAIN/api/webhooks/paddle?siteId=YOUR_SITE_ID
```

| Paddle field | Provider payload path | How Grosslytics uses it |
| --- | --- | --- |
| Visitor ID | `data.custom_data.visitor_id` | Links the sale to the tracked visit |
| Paid amount | `data.details.totals.grand_total` | Starting total before tax exclusion |
| Tax | `data.details.totals.tax` | Deducted so sales tax is never counted as revenue |
| Currency | `data.currency_code` | Must match your site's reporting currency |
| Renewal flag | `data.origin` | Marks `subscription_recurring` charges as renewals |
| Signature | `Paddle-Signature` header | Verified against the raw body and signing secret |

Keep the raw JSON request body intact for signature checks, as described in [Paddle webhook signature verification](https://developer.paddle.com/webhooks/about/signature-verification/) and the [transaction.completed event docs](https://developer.paddle.com/webhooks/transactions/transaction-completed/). See the [payment integration reference](/docs/#payments) for configuration details.

## Step 3: How do you test and compare sources in sandbox?

Open a campaign-tagged link, complete a Paddle sandbox checkout, and verify the credited source on the dashboard.

```text
https://your-site.example/pricing?utm_source=google&utm_medium=cpc&utm_campaign=paddle-test
```

Confirm the initial transaction appears under `google` and inspect a sandbox subscription renewal (`origin: "subscription_recurring"`) as well as a test full refund (`adjustment.created` / `adjustment.updated`).

<figure>
  <a href="/images/comparisons/grosslytics-public-demo-2026-11-08.jpg" aria-label="Open full-size Grosslytics screenshot">
    <img src="/images/comparisons/grosslytics-public-demo-2026-11-08.jpg" alt="Grosslytics public demo showing first-touch net revenue, a daily chart and source reports." width="1010" height="1209" loading="lazy" decoding="async" />
  </a>
  <figcaption>Grosslytics public demo with sample data. Captured November 8, 2026. <a href="https://grosslytics.com/app/demo">View source page</a>.</figcaption>
</figure>

Use the [dashboard definitions](/docs/#dashboard) to compare first-touch, last-touch, and 50/50 linear attribution across your sources.

## How are Paddle tax, fees, and refunds handled?

Grosslytics removes reported VAT/sales tax first, then subtracts Paddle's standard 5% + $0.50 fee schedule to calculate net revenue per channel.

On a $120 Paddle payment that includes $20 in sales tax, Grosslytics strips the $20 tax and estimates $6.50 in fees (`5% of $120 + $0.50`), recording $93.50 in net revenue:

```text
paid = 12000 cents
tax = 2000 cents
estimated_fee = round(12000 * 500 / 10000) + 50 = 650 cents
net_after_tax_and_fee = 12000 - 2000 - 650 = 9350 cents
```

Because negotiated volume pricing or multi-currency settlements can differ from the default schedule, compare totals with your Paddle settlement statements. Approved full refunds (`adjustment.created` and `adjustment.updated`) automatically reverse the sale from revenue, while partial refunds require manual reconciliation. Model fee impacts across providers with the [payment fee calculator](/tools/payment-fee-calculator/).

## How Grosslytics reports Paddle renewals and LTV

Grosslytics tracks cumulative historical LTV by first-touch source by summing net receipts (including `subscription_recurring` charges) per visitor ID.

For example, if two visitors acquired from a blog post generate $300 in combined net charges (initial purchases plus renewals), the LTV panel reports $150 per customer for that channel. Because Paddle webhooks do not populate email identity matching in the current handler, matching across renewals relies on `custom_data.visitor_id` remaining intact on the subscription. Note that this shows cumulative observed revenue per customer rather than normalized MRR or a fixed 90-day cohort window.

## Pre-launch verification checklist

1. Confirm `gl_vid` appears in `custom_data.visitor_id` on the sandbox `transaction.completed` webhook.
2. Verify `Paddle-Signature` validation succeeds with `HTTP 200` (check your signing secret if `401`).
3. Confirm reported tax is deducted and currency matches your site settings.
4. Test a `subscription_recurring` renewal and verify it credits the original acquisition channel.
5. Trigger a full refund adjustment and confirm the sale is marked refunded in Grosslytics.

If you also use Polar or Dodo Payments alongside Paddle, follow our [Polar and Dodo attribution guide](/blog/polar-dodo-payments-analytics/).

## Frequently asked questions

### Why is customData spelled differently in the webhook?

`Paddle.js` accepts camelCase `customData` in the browser, while Paddle's REST API and webhook payloads return snake_case `custom_data`. Grosslytics reads `data.custom_data.visitor_id` from the webhook.

### Does Grosslytics handle Paddle refunds automatically?

Yes, for approved full refunds sent via `adjustment.created` and `adjustment.updated`. Partial, pending, or rejected adjustments are ignored and need manual reconciliation.

### Does choosing a 90-day date range show 90-day cohort LTV?

No. The LTV panel aggregates all-time net receipts per identified customer grouped by their first-touch source, independent of the traffic date range selected for the main chart.

### Does the net figure match my exact Paddle payout?

Grosslytics strips reported tax and applies the standard 5% + $0.50 fee estimate rather than reading exact settlement `totals.fee` or foreign-exchange payouts, so use Paddle statements for final bookkeeping.
