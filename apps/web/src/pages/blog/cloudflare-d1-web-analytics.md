---
layout: "../../layouts/Article.astro"
title: "How to Self-Host Revenue Analytics on Cloudflare D1"
description: "Deploy Grosslytics on Cloudflare Workers and D1 in five steps. Understand free-tier limits, queue costs, prebuilt and source install paths, and verification."
primaryKeyword: "self hosted web analytics cloudflare d1"
format: "how-to"
visualReview: {"decision":"include-screenshots","reason":"Real Cloudflare D1 pricing documentation explains the database allowance; the real public Grosslytics demo illustrates the reporting interface with clearly identified sample data."}
updatedDate: "2026-11-24"
pubDate: "2026-11-08"
---

Deploy Grosslytics on your own Cloudflare account in five steps using `npx grosslytics@latest install --free` (or `bun run setup` from source), then check your Workers, D1, and Queues free-tier budgets before sending live traffic. Checking all four meters together ensures your self-hosted revenue analytics stack runs smoothly inside Cloudflare's allowances.

## Key takeaways

- Monitor every Cloudflare service meter: Workers, D1 (500 MB per database on Free), Queues (10,000 operations/day), and Durable Objects.
- Install the prebuilt free release with `npx grosslytics@latest install --free`, or build from source with `bun run setup`.
- Queues are usually the first free-tier ceiling: 10,000 daily operations cover roughly 3,333 queued events per day before retries.
- Verify browser events (`202 Accepted`), queue delivery, and one signed test payment before relying on reports.

Cloudflare's allowances below were verified on November 21, 2026. Check your account usage if other Workers share the same account budgets.

## Step 1: Check whether your workload fits the free plan

Grosslytics uses two Workers, a D1 SQLite database, a Queue with a dead-letter queue, and a SQLite-backed Durable Object (`SiteLiveHub`) for live visitor presence.

| Component | Free allowance relevant to this setup | What to monitor |
| --- | --- | --- |
| Workers | 100,000 requests/day; 10 ms CPU time per invocation | API requests, dashboard queries, and CPU time |
| D1 | 5M rows read/day, 100,000 rows written/day; 500 MB per database (5 GB account max) | Query row scans, index writes, and `grosslytics-db` size |
| Queues | 10,000 standard operations/day | Write, read, and delete operations (3 per message) plus retries |
| Durable Objects | 100,000 requests/day; 13,000 GB-s/day duration | Live presence updates and WebSocket connections |

Check current [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/), and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) before deploying high-traffic sites. Because Grosslytics stores visits and payments in one D1 database, plan around the [500 MB per-database cap](https://developers.cloudflare.com/d1/platform/limits/) and configure visit data retention under Settings if needed.

<figure>
  <a href="/images/comparisons/cloudflare-d1-2026-11-08-d799dbdce4a1.jpg" aria-label="Open full-size Cloudflare D1 screenshot">
    <img src="/images/comparisons/cloudflare-d1-2026-11-08-d799dbdce4a1.jpg" alt="Cloudflare D1 billing table showing free daily reads, writes and total storage limits." width="1269" height="714" loading="lazy" decoding="async" />
  </a>
  <figcaption>Cloudflare's public D1 pricing documentation shows the database allowance. Captured 2026-11-08. <a href="https://developers.cloudflare.com/d1/platform/pricing/#billing-metrics">Source: Cloudflare D1</a>.</figcaption>
</figure>

### Estimate your daily Queue operations first

Each accepted browser event sends one Queue message, which consumes three standard operations (write, read, and delete):

```text
Queue operations = 2,000 events * 3 operations = 6,000/day
Remaining queue allowance = 10,000 - 6,000 = 4,000/day
Idealized free queue ceiling = floor(10,000 / 3) = 3,333 events/day
```

Because pageviews, leave events (read time and scroll depth), and goal clicks each generate an event, 3,333 events correspond to roughly 1,000 to 1,500 pageviews/day. Above that traffic, Cloudflare's Workers Paid plan ($5/month base) lifts Queue and D1 ceilings.

## Step 2: Prepare your account and analytics hostname

Use a Cloudflare account that manages your domain, an unused subdomain such as `analytics.example.com`, and Node.js 22.12+ (or Node.js 22.23.4+, Git, and Bun for source builds).

For a brand-new Cloudflare account, open **Workers & Pages** in the Cloudflare Dashboard once so your `workers.dev` subdomain initializes. Ensure `analytics.example.com` has no conflicting `A`, `AAAA`, or `CNAME` records before running the installer.

## Step 3: Deploy the API, dashboard, and database

Run the CLI installer from a dedicated working directory:

```bash
npx grosslytics@latest install --free
```

For Lifetime licenses (no footer attribution link required), use `npx grosslytics@latest install --lifetime`. To build directly from a source checkout, follow the [source installation instructions](/docs/#self-host).

The installer prompts for your hostname, Cloudflare zone, and dashboard password, creates `grosslytics-db` and both queues, applies D1 migrations, and deploys the API and web Workers onto the same analytics hostname so `/api/*`, `/g.js`, and `/app` share one origin. Keep your generated `grosslytics-install` directory private and store the printed `API_TOKEN` in a password manager.

To install new releases later, run `npx grosslytics@latest update` from that same folder (or `git pull && bun run setup` for source builds).

## Step 4: Add your site and install the tracker

Open `https://analytics.example.com/app`, sign in, and register the domain you want to track. Copy the generated site ID and paste the tag into your site's `<head>`:

```html
<script
  defer
  src="https://analytics.example.com/g.js"
  data-site-id="YOUR_SITE_ID"
></script>
```

If you used `--free`, add the `"Powered by Grosslytics"` link inside your tracked site's homepage footer (`rel="sponsored"` or `rel="nofollow"` are both accepted) and click **Verify** so the dashboard opens.

Next, test your tracking pipeline in an ordinary browser window (avoid headless WebDriver sessions, which `g.js` filters out as bots) using a campaign parameter such as `https://www.example.com/?utm_source=setup-check&utm_medium=referral`. If your site enforces a Content Security Policy, allow `analytics.example.com` in both `script-src` and `connect-src` per the [tracker setup docs](/docs/#install).

| Symptom | Where to check |
| --- | --- |
| `g.js` fails to load or no `/api/event` call appears | Check script URL, `data-site-id`, and CSP console errors |
| `/api/event` returns `403` or `404` | Verify tracked domain spelling and `/api/*` routing to the API Worker |
| `/api/event` returns `202`, but visit is missing | Inspect API Worker logs, `grosslytics-ingest` queue depth, and dead-letter queue errors |

## Step 5: Connect payments and verify revenue attribution

Configure your webhook destination and signing secret under **Payments** in your dashboard:

```text
https://analytics.example.com/api/webhooks/PROVIDER?siteId=YOUR_SITE_ID
```

Follow the dedicated setup guide for your payment stack: [Stripe](/blog/stripe-revenue-attribution/), [Paddle Billing](/blog/paddle-revenue-attribution/), [Polar & Dodo Payments](/blog/polar-dodo-payments-analytics/), or [Razorpay](/blog/razorpay-revenue-attribution/). Always send one sandbox or test purchase from a tagged URL and verify the sale credits your UTM source in the expected currency.

<figure>
  <a href="/images/comparisons/grosslytics-2026-11-08-4f4bddd90794.jpg" aria-label="Open full-size Grosslytics screenshot">
    <img src="/images/comparisons/grosslytics-2026-11-08-4f4bddd90794.jpg" alt="Grosslytics public demo with sample visitor, net revenue and traffic-source charts." width="1265" height="712" loading="lazy" decoding="async" />
  </a>
  <figcaption>The Grosslytics public demo shows the dashboard with sample data. Captured 2026-11-08. <a href="https://grosslytics.com/app/demo">Source: Grosslytics</a>.</figcaption>
</figure>

## What should you monitor after launch?

Watch **D1 → Metrics → Row Metrics** alongside Queues backlog and Worker CPU. Because Grosslytics queries event rows dynamically for custom ranges and filters, enable an appropriate **Keep visit data** retention window (90 days to 2 years) under Settings if you run high-traffic sites on Cloudflare's free tier. When traffic exceeds free limits, upgrading to Workers Paid ($5/month) or choosing [managed hosting or Lifetime](/#pricing) keeps ingestion uninterrupted. See also how Grosslytics compares with self-hosted Docker analytics in [PostHog vs Grosslytics](/compare/posthog-alternative/) and [Plausible vs Grosslytics](/compare/plausible-alternative/).

## Frequently asked questions

### Is Cloudflare D1 enough for self-hosted web analytics?

D1 handles relational storage for visits, sessions, and payments, while Workers serve ingest and dashboard APIs, Queues buffer write bursts, and a Durable Object drives live presence. All four components fit in one Cloudflare account.

### Can this run with no monthly server bill?

Yes, for sites staying within Cloudflare's Free plan limits (around 1,000-1,500 pageviews/day given Queue operation counts). Above that volume, Cloudflare's $5/month Workers Paid plan covers substantially higher throughput.

### Can I upgrade from free self-hosting to Lifetime later?

Yes. Self-hosting with `--free` and `--lifetime` run the exact same stack on your Cloudflare account. Applying a Lifetime license removes the footer attribution requirement and grants commercial usage rights without redeploying your database.
