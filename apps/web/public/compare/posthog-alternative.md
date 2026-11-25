# PostHog Alternative: Focused SaaS Revenue Analytics

> Canonical URL: https://grosslytics.com/compare/posthog-alternative/ | Updated: 2026-11-24

Choose **PostHog** if you want product telemetry, session replays, feature flags, and SQL insights inside one suite with a 1-million-event free analytics tier. Choose **Grosslytics** as a focused PostHog alternative when your main question is which traffic sources, blog posts, and AI answers generate paying customers after payment-gateway fees and ad spend, with a `1.8 KB` tracker and zero SQL setup.

## Key takeaways

- PostHog includes **1 million free analytics events/month**, though session replay, feature flags, and data warehouse syncs carry separate usage limits.
- PostHog retired its dedicated Revenue analytics dashboard; revenue fields now live inside Insights, SQL, and managed views, and native billing sync currently focuses on Stripe.
- **Grosslytics** ships an out-of-the-box revenue attribution dashboard for 10 payment gateways, automatic fee and ad-spend profit views, and a **3,782-byte raw / 1,858-byte Brotli** tracker.
- Grosslytics offers `$0` open-source Cloudflare self-hosting (`$29` Lifetime) or `$5.99/month` Cloud for 100,000 events.

## When is focused revenue analytics better than PostHog?

If your product team needs funnel drop-offs inside an authenticated web app, session recordings, and A/B test flags, PostHog is built for that job. If you are a founder who mainly wants to see whether a blog post, Google ad, or ChatGPT mention produces net revenue after Stripe, Paddle, or Razorpay fees, configuring PostHog data pipelines and custom SQL dashboards adds maintenance you do not need.

Grosslytics is our product; PostHog specifications reflect [PostHog's pricing](https://posthog.com/pricing) and [revenue analytics docs](https://posthog.com/docs/revenue-analytics) reviewed in November 2026.

## How do PostHog and Grosslytics compare?

| Capability | PostHog | Grosslytics |
| --- | --- | --- |
| Primary focus | Product analytics, replay, flags & experiments | Source-to-payment attribution & net profit |
| Billing integrations | Native Stripe data source + custom events | 10 signed webhooks (Stripe, Paddle, Razorpay, Polar, Dodo, PayPal, Cashfree, Gumroad, RevenueCat, Lemon Squeezy) |
| Reporting workflow | Custom Insights, SQL, and managed views | Ready-made revenue, LTV, journey, and AI traffic dashboard |
| Session replay & flags | Built in (separate free & paid allowances) | Not included (focused on marketing attribution & optional click map) |
| Revenue definition | Raw synced properties / SQL queries | Gross, net (after gateway fees), and profit (after ad spend) |
| Main tracker payload | Configurable JS SDK (`posthog-js`) | `g.js`: 3,782 bytes raw / 1,858 bytes Brotli |
| Free allowance | 1M analytics events/month (Cloud) | Unlimited self-hosted on Cloudflare Free plan (footer credit required) |
| Paid entry pricing | Usage-based past free allowances | `$29` once Lifetime or `$5.99/month` Cloud (100k events) |

## Public dashboard comparison

### PostHog

<figure>
  <a href="/images/comparisons/posthog-homepage-2026-11-08.jpg" aria-label="Open full-size PostHog screenshot">
    <img src="/images/comparisons/posthog-homepage-2026-11-08.jpg" alt="PostHog homepage showing its platform overview and illustrative AI analysis with sample data." width="1025" height="1226" loading="lazy" decoding="async" />
  </a>
  <figcaption>PostHog homepage with illustrative sample data. Captured November 8, 2026. <a href="https://posthog.com/">View source page</a>.</figcaption>
</figure>

### Grosslytics

<figure>
  <a href="/images/comparisons/grosslytics-public-demo-2026-11-08.jpg" aria-label="Open full-size Grosslytics screenshot">
    <img src="/images/comparisons/grosslytics-public-demo-2026-11-08.jpg" alt="Grosslytics public demo showing first-touch net revenue, a daily chart and source reports." width="1010" height="1209" loading="lazy" decoding="async" />
  </a>
  <figcaption>Grosslytics public demo with sample data. Captured November 8, 2026. <a href="https://grosslytics.com/app/demo">View source page</a>.</figcaption>
</figure>

## Does PostHog require HogQL for revenue reporting?

Not strictly. While PostHog removed its standalone Revenue analytics dashboard, revenue properties remain queryable via standard Insights, managed views, and SQL. Native payment-platform syncing currently supports Stripe ([PostHog payment-platform docs](https://posthog.com/docs/revenue-analytics/payment-platforms)), whereas founders selling via Paddle, Razorpay, Dodo Payments, or Polar must build custom event pipelines.

## Measured Grosslytics script size

Grosslytics keeps marketing pages lightweight by keeping the main tracker separate from the optional click-map script (`c.js`). Build output for `g.js` measures **3,782 bytes raw** and **1,858 bytes Brotli quality 11 (1.81 KB)**. Reproduce it locally from the [Grosslytics repository](https://github.com/vidneat/grosslytics):

```sh
bun install
bun run --cwd packages/tracker build
```

PostHog's payload depends on which `posthog-js` modules (autocapture, session replay, surveys) you bundle or load dynamically ([PostHog JS config](https://posthog.com/docs/libraries/js/config)).

## Is a smaller analytics tool always cheaper than PostHog?

Not always on software licensing alone. For a site sending 100,000 events/month (80,000 pageviews plus 20,000 custom events), PostHog Cloud's 1M free event allowance costs `$0`, whereas Grosslytics Cloud is `$5.99/month` (`$71.88/year`).

However, if you sync large data warehouse sources or turn on session replay across high-traffic marketing pages, PostHog bills per product meter. Self-hosting Grosslytics on Cloudflare keeps your software bill at `$0` (`$29` once for Lifetime without a footer link). Compare total margins with our [payment fee calculator](/tools/payment-fee-calculator/) and see [how to self-host on Cloudflare D1](/blog/cloudflare-d1-web-analytics/).

## What revenue tracking tradeoffs apply to Grosslytics?

- **Net & profit scope:** Automatically deducts sales tax, gateway fee schedules (or real fees for PayPal/RevenueCat), and entered/CSV ad spend; excludes payroll and infra costs.
- **Refunds:** Automatically deducts full refunds for Stripe, Paddle, Dodo, and Gumroad; partial refunds require manual reconciliation.
- **Attribution:** Supports first-touch, last-touch, and 50/50 linear split rather than custom multi-touch algorithmic weighting.
- **AI Search tracking:** Identifies ChatGPT, Perplexity, Claude, Gemini, and Copilot visits by referrer and `utm_source` tag, though private prompt text is never exposed by AI engines.

## How to trial Grosslytics alongside PostHog

1. Keep PostHog running for in-app product behavior and feature flags.
2. Deploy Grosslytics using the [self-hosting guide](/docs/#self-host) or [setup wizard](/start/).
3. Connect visitor metadata (`gl_vid`) and webhooks following the [Stripe guide](/blog/stripe-revenue-attribution/) or [payments docs](/docs/#payments).
4. Compare attributed revenue and net fees across channels using the [dashboard definitions](/docs/#dashboard).

Also see how Grosslytics compares in [Plausible vs Grosslytics](/compare/plausible-alternative/), [GA4 vs Grosslytics](/compare/ga4-alternative/), and [7 DataFast Alternatives](/compare/datafast-alternative/).

## Frequently asked questions

### Can PostHog track Stripe revenue?

Yes. PostHog supports Stripe as a revenue data source and allows custom purchase events inside Insights and SQL views.

### Is Grosslytics always cheaper than PostHog?

No. PostHog's 1M monthly analytics events are free on Cloud, while Grosslytics Cloud starts at `$5.99/month` for 100,000 events. Grosslytics becomes free when self-hosted on your own Cloudflare Free account.

### Should I replace PostHog with Grosslytics completely?

Only if you do not need session replays, feature flags, or product experiments. Many SaaS teams use Grosslytics for lightweight marketing attribution and net revenue on public pages while keeping product analytics inside the app.

### Can Grosslytics reveal the exact ChatGPT prompt that led to a sale?

No analytics tool can see private AI chat prompts; Grosslytics reports the AI source (`chatgpt.com`, `perplexity.ai`, etc.), landing page, reading time, and revenue generated.
