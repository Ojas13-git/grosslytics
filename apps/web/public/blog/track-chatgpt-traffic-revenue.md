---
layout: "../../layouts/Article.astro"
title: "How to Track ChatGPT Traffic Through to Real Revenue"
description: "Identify ChatGPT visits by tag and referrer, carry the visitor into checkout and match payments. Includes a Stripe sandbox test and the limits of the data."
primaryKeyword: "track ChatGPT traffic revenue"
format: "how-to"
visualReview: {"decision":"include-screenshots","reason":"A real capture of the public demo's Sources panel shows where AI sources appear next to revenue. It is labeled as sample data and is not evidence of performance."}
updatedDate: "2026-11-24"
pubDate: "2026-11-09"
---

Capture `utm_source=chatgpt.com` or the `chatgpt.com` referrer when a visitor lands, attach their visitor ID (`gl_vid`) to checkout, and match the signed payment webhook back to the visit. In our Stripe sandbox test, a tagged ChatGPT visit carried cleanly into checkout and credited a $9.00 payment ($8.44 net) to `chatgpt.com` under AI Search.

## Key takeaways

- Check for `utm_source=chatgpt.com` on landing URLs and `chatgpt.com` in referrers before any redirect strips query parameters.
- GA4 includes an AI Assistant channel, though it only records revenue if you instrument ecommerce `purchase` events.
- Clicks copied without a tag or referrer fall into Direct, so tracked AI revenue represents a minimum baseline.
- Grosslytics groups ChatGPT, Perplexity, Claude, Gemini, and Copilot under **AI Search** automatically.

## How does ChatGPT traffic appear in analytics?

A ChatGPT click arrives in one of three forms, and only the first two carry source metadata:

| Arrival signal | How to spot it | Attribution result |
| --- | --- | --- |
| Tagged link | `utm_source=chatgpt.com` on landing URL | Attributed as `chatgpt.com` (AI Search) |
| Untagged referrer | HTTP referrer `chatgpt.com` or `chat.openai.com` | Attributed as `chatgpt.com` (AI Search) |
| Copied bare URL | No tag and no referrer header | Reported as Direct |

Make sure your server redirects preserve query strings so `utm_source=chatgpt.com` reaches the landing page where your analytics script runs.

## Can GA4 track ChatGPT revenue without another tool?

Yes, if your site already sends ecommerce `purchase` events with `transaction_id`, `value`, and `currency` to GA4.

Google's [default channel documentation](https://support.google.com/analytics/answer/9756891) groups `chatgpt.com` into the **AI Assistant** channel (`ai-assistant`). Note that Google AI Overviews and AI Mode remain grouped under Organic Search.

1. Open **Reports -> Acquisition -> Traffic acquisition** and switch the primary dimension to **Session source** to isolate `chatgpt.com` sessions and **Total revenue**.
2. Open a tagged test URL and complete a test checkout while watching **DebugView** to confirm your `purchase` event matches [Google's ecommerce setup guide](https://developers.google.com/analytics/devguides/collection/ga4/set-up-ecommerce).
3. Compare **Traffic acquisition** (session-level) with **User acquisition** (first user source) per [Google's acquisition report docs](https://support.google.com/analytics/answer/14731736).

If you want payment attribution backed directly by signed Stripe, Paddle, or Razorpay webhooks without maintaining GA4 ecommerce tags or cookie banners, see [GA4 vs Grosslytics](/compare/ga4-alternative/).

## How do you connect ChatGPT visits to payments?

I'll walk through the four-step setup in Grosslytics, though the same visitor-ID handoff works in any webhook-based revenue analytics stack:

**1. Install the tracker on landing pages.**

```html
<script defer src="https://grosslytics.com/g.js"
  data-site-id="YOUR_SITE_ID"></script>
```

Check the [installation guide](/docs/#install) for self-hosted domains and Content Security Policy rules.

**2. Verify `utm_source=chatgpt.com` classification.** Open a private window to:

```text
https://your-site.example/?utm_source=chatgpt.com
```

Grosslytics automatically groups tagged or referred visits from ChatGPT, Perplexity, Claude, Gemini, and Copilot under **AI Search**.

**3. Forward `gl_vid` into checkout.** Grosslytics decorates Stripe Payment Links automatically with `client_reference_id` ([Stripe URL parameter docs](https://docs.stripe.com/payment-links/url-parameters)). For server-created sessions or other gateways, follow the [Stripe attribution guide](/blog/stripe-revenue-attribution/), [Paddle Billing guide](/blog/paddle-revenue-attribution/), [Polar & Dodo guide](/blog/polar-dodo-payments-analytics/), or [Razorpay guide](/blog/razorpay-revenue-attribution/).

**4. Connect signed payment webhooks.** Follow the [payments reference](/docs/#payments). If a visit shows under AI Search while its payment stays Unattributed, check that checkout preserved `client_reference_id` or `metadata.visitor_id`.

## What happened when we tested it?

One tagged visit carried through checkout into a credited Stripe sandbox payment.

We ran this test on November 9, 2026, on a local Grosslytics instance in a real browser using Stripe's sandbox test card. We typed the tagged URL directly rather than clicking inside ChatGPT, so this verifies the end-to-end technical pipeline rather than real-world ChatGPT click volume.

| Stage | Observed result |
| --- | --- |
| Landing with `utm_source=chatgpt.com` | Accepted and stored as source `chatgpt.com` |
| Channel stored | `AI Search` |
| Navigating to pricing | Source persisted as `chatgpt.com` |
| Checkout link | `client_reference_id` automatically set to `gl_vid` |
| Payment recorded | $9.00 gross, $0.56 estimated fee, $8.44 net |
| Attribution credit | First touch and last touch both `chatgpt.com` |

Returning from Stripe's hosted success URL logged a separate `Direct (Shared Link)` visit. It did not overwrite credit for that sale, though first-touch attribution protects original AI discovery if a buyer returns days later to make a second purchase.

## How should you read the report?

Compare net revenue per visitor across channels, inspecting both first-touch and last-touch views.

<figure>
  <a href="/images/comparisons/grosslytics-2026-11-09-c30745b57ea9.png" aria-label="Open full-size Grosslytics screenshot">
    <img src="/images/comparisons/grosslytics-2026-11-09-c30745b57ea9.png" alt="Grosslytics Sources panel listing chatgpt.com and perplexity.ai as AI search with visitors, net revenue and revenue per visitor." width="1232" height="830" loading="eager" decoding="async" />
  </a>
  <figcaption>The Sources panel in the Grosslytics public demo, showing sample data. Captured 2026-11-09. <a href="https://grosslytics.com/app/demo">Source: Grosslytics</a>.</figcaption>
</figure>

Keep visitor and sale counts next to revenue per visitor so a single high-ticket order is easy to spot against high-volume channels. Check the [dashboard definitions](/docs/#dashboard) for linear (50/50) split details, or compare how Grosslytics handles AI traffic vs other tools in [DataFast alternatives](/compare/datafast-alternative/).

## What can this method not tell you?

No analytics tracker can inspect private chat transcripts or recover stripped referrers:

- **Exact prompts:** Referrers and UTMs carry the source domain, never the prompt text a user typed in ChatGPT.
- **Untagged Direct traffic:** Copied links without `utm_source=chatgpt.com` land in Direct.
- **Google AI Overviews:** Clicks from Google's AI features arrive inside [Search Console Web totals](https://developers.google.com/search/docs/appearance/ai-features) as Google organic traffic.
- **Exact processor payouts:** Net revenue subtracts each gateway's published fee schedule (model rates in the [payment fee calculator](/tools/payment-fee-calculator/)).

## Frequently asked questions

### What does utm_source=chatgpt.com mean?

OpenAI appends `utm_source=chatgpt.com` to outbound links in ChatGPT Search answers so site owners can isolate ChatGPT referrals from generic traffic.

### Should I remove utm_source=chatgpt.com from my URLs?

Never strip it on the server before `g.js` runs, or you erase the attribution signal. Use `<link rel="canonical">` tags (built into Grosslytics pages) so search engines ignore the query parameter.

### Why does ChatGPT traffic show as Direct?

Desktop apps, privacy browsers, or copied plain URLs omit both the UTM parameter and HTTP referrer header, making them indistinguishable from direct visits.

### Can I see which ChatGPT prompt led to a sale?

No. You see the landing page, reading time, and payment converted from `chatgpt.com`, never the user's private prompt.
