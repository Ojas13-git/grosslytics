---
layout: "../../layouts/Article.astro"
title: "DataFast vs DataBull vs Grosslytics: Costs & Features"
description: "Compare DataFast, DataBull, and Grosslytics across 12 criteria, annual cost scenarios, attribution models, and measured tracker sizes."
primaryKeyword: "datafast vs databull"
format: "comparison"
updatedDate: "2026-11-24"
pubDate: "2026-11-08"
---

Choose **DataFast** for zero-ops managed revenue tracking (from $9/month) with Shopify and WooCommerce support, **DataBull** for a closed-source $49 one-time Cloudflare setup with Creem support, and **Grosslytics** for open-source (AGPL-3.0) Cloudflare or $5.99/month Cloud analytics covering 10 payment gateways (including Paddle and Razorpay) with automatic fee and ad-spend profit reporting.

## Key takeaways

- **DataFast** is fully managed with volume-based tiers starting at $9/month and direct Shopify/WooCommerce support.
- **DataBull** offers a $49 one-time self-hosted Cloudflare license (unlimited events) plus a hosted beta from $9/month, covering Stripe, Polar, Dodo, and Creem.
- **Grosslytics** offers `$0` open-source self-hosting (footer credit required), a `$29` Lifetime license, and `$5.99/month` Cloud (100k events), adding Paddle, Razorpay, PayPal, Gumroad, Cashfree, and RevenueCat plus gateway fee deductions.
- Model gateway fees alongside tool cost in the [SaaS payment fee calculator](/tools/payment-fee-calculator/).

## How do DataFast, DataBull, and Grosslytics compare across 12 criteria?

Grosslytics is our product. Specifications below come from each vendor's public documentation reviewed in November 2026 and the current Grosslytics codebase.

| Criterion | DataFast | DataBull | Grosslytics |
| --- | --- | --- | --- |
| 1. Operating model | Managed SaaS | Self-hosted Cloudflare or hosted beta | Self-hosted Cloudflare or managed Cloud |
| 2. Pricing | Volume-based subscription (from $9/mo) | $49 once self-host; hosted from $9/mo | $0 self-host (footer link); $29 Lifetime; $5.99/mo Cloud |
| 3. Event limit | Tiered by monthly events | Self-host: unlimited; hosted: tiered | Self-host: Cloudflare limits; Cloud: 100k/mo |
| 4. Native payment gateways | Stripe, Lemon Squeezy, Polar, Shopify | Stripe, Polar, Dodo, Creem | Stripe, Paddle, Razorpay, Polar, Dodo, PayPal, Cashfree, Gumroad, RevenueCat, Lemon Squeezy |
| 5. Custom payments | Payments API | Payments API | Provider webhooks + metadata keys |
| 6. Attribution models | Source & customer journey | First, last, and last non-direct | First touch, last touch, and 50/50 linear |
| 7. Fee deductions | Gross payment reporting | Gross payment reporting | Automatic schedule (exact fees on PayPal & RevenueCat) |
| 8. Ad spend & profit | Ad integrations | Ad spend & ROAS tracking | Manual/CSV ad spend + MER & net profit |
| 9. Social & AI tracking | X and Reddit mention tracking | Standard referral tracking | AI Search channel + unmasked in-app browsers + AI crawlers |
| 10. Cookies / storage | Cookie or cookieless option | Cookie, cookieless, or consent mode | Cookie-free (`localStorage` visitor ID) |
| 11. Developer & AI access | API, CLI, MCP | API, CLI, MCP | REST API and Streamable HTTP MCP |
| 12. Source availability | Proprietary | Proprietary | Open source (AGPL-3.0; commercial with Lifetime) |

Sources: [DataFast](https://datafa.st/), [DataBull](https://databull.app/), [DataBull attribution](https://databull.app/docs/attribution), [DataBull payments](https://databull.app/docs/revenue), [Grosslytics payments](/docs/#payments), and [dashboard definitions](/docs/#dashboard).

## What do the public dashboards look like?

### DataFast

<figure>
  <a href="/images/comparisons/datafast-public-demo-2026-11-08.jpg" aria-label="Open full-size DataFast screenshot">
    <img src="/images/comparisons/datafast-public-demo-2026-11-08.jpg" alt="DataFast public demo showing visitors, attributed revenue and a daily traffic chart." width="1265" height="712" loading="eager" decoding="async" />
  </a>
  <figcaption>DataFast public demo. Captured November 8, 2026. <a href="https://datafa.st/demo">View source page</a>.</figcaption>
</figure>

### DataBull

<figure>
  <a href="/images/comparisons/databull-homepage-demo-2026-11-08.jpg" aria-label="Open full-size DataBull screenshot">
    <img src="/images/comparisons/databull-homepage-demo-2026-11-08.jpg" alt="DataBull homepage sample dashboard showing traffic, revenue and referrer reports." width="1265" height="712" loading="lazy" decoding="async" />
  </a>
  <figcaption>DataBull homepage sample dashboard. Captured November 8, 2026. <a href="https://databull.app/#demo">View source page</a>.</figcaption>
</figure>

### Grosslytics

<figure>
  <a href="/images/comparisons/grosslytics-public-demo-2026-11-08.jpg" aria-label="Open full-size Grosslytics screenshot">
    <img src="/images/comparisons/grosslytics-public-demo-2026-11-08.jpg" alt="Grosslytics public demo showing first-touch net revenue, a daily chart and source reports." width="1010" height="1209" loading="lazy" decoding="async" />
  </a>
  <figcaption>Grosslytics public demo with sample data. Captured November 8, 2026. <a href="https://grosslytics.com/app/demo">View source page</a>.</figcaption>
</figure>

## What could you pay over 12 months?

Annual cost combines software licensing with any Cloudflare usage above the free tier:

| Plan scenario | Calculation | 12-month total |
| --- | --- | ---: |
| DataFast Starter (10k events/mo) | 12 x $9 | $108 |
| DataFast Growth (higher tier) | 12 x $19 | $228 |
| DataBull self-host (Cloudflare Free tier) | $49 + $0 | $49 |
| DataBull self-host (Workers Paid $5/mo) | $49 + 12 x $5 | $109 |
| Grosslytics Cloud (100k events/mo) | 12 x $5.99 | $71.88 |
| Grosslytics Lifetime (Workers Paid $5/mo) | $29 + 12 x $5 | $89 |
| Grosslytics Free self-host (Cloudflare Free) | $0 + $0 | $0 |

Check Cloudflare's D1 and Queue free-tier thresholds in our [Cloudflare D1 self-hosting guide](/blog/cloudflare-d1-web-analytics/) and review [DataBull's free-plan docs](https://databull.app/docs/free-plan).

## How do revenue definitions differ?

Grosslytics reports three views across every channel: **gross** (charge minus sales tax), **net** (minus gateway fees), and **profit** (minus gateway fees and CSV/manual ad spend). Full refunds are deducted automatically for Stripe, Paddle, Dodo Payments, and Gumroad.

DataBull offers first-touch, last-touch, and last-non-direct attribution, while Grosslytics splits credit via first-touch, last-touch, or a 50/50 linear split between first and last touch. Keep in mind that all three tools record cash payments and subscription renewals as charges arrive rather than normalized MRR.

## Measured Grosslytics tracker size

The current Grosslytics main tracker (`g.js`) builds to **3,782 bytes raw (3.69 KB)** and **1,858 bytes Brotli quality 11 (1.81 KB)**, keeping the optional click-map script (`c.js`, 800 bytes Brotli) separate so landing pages stay fast. Reproduce the build from the [Grosslytics repository](https://github.com/vidneat/grosslytics):

```sh
bun install
bun run --cwd packages/tracker build
```

For wider tool comparisons, see [7 DataFast Alternatives](/compare/datafast-alternative/) and [5 Best DataBull Alternatives](/compare/databull-alternative/).

## Switching without rewriting goal tags

Grosslytics reads existing `data-fast-goal` attributes, `window.datafast` / `window.databull` JS calls, and `datafast_visitor_id` / `databull_visitor_id` metadata on Stripe webhooks. Before removing your old script, test one checkout in staging and verify both initial charges and renewals per our [migration guide](/docs/#switch) and [Stripe attribution guide](/blog/stripe-revenue-attribution/).

## Frequently asked questions

### Is DataBull cheaper than DataFast?

Yes for most indie SaaS sites. DataBull's `$49` one-time license beats `$108+/year` on DataFast as long as your traffic fits Cloudflare's free or `$5/month` Workers Paid plan, and Grosslytics' free/\$29 Lifetime options lower the upfront license even further.

### Does Grosslytics calculate true net profit?

Grosslytics subtracts sales tax, gateway fees, and the ad spend you enter or import per channel, giving you contribution margin per marketing source rather than full company P&L accounting (payroll and hosting stay outside the tool).

### Can I migrate from DataFast or DataBull without changing goal tags?

Yes, for browser goals and Stripe checkout metadata: `g.js` automatically intercepts `data-fast-goal` attributes and `window.datafast()` / `window.databull()` calls, and the Stripe handler reads `datafast_visitor_id` and `databull_visitor_id`.
