import { useId, useState } from 'react';

// Entry-plan prices from each vendor's own website, checked 2026-11-06.
// Re-verify before editing: these are public claims about other companies.
const PLANS = [
	{ name: 'DataFast', detail: 'Starter, $9/mo, 10k events', firstYear: 9 * 12 },
	{ name: 'Plausible', detail: 'Starter, $9/mo, 10k pageviews', firstYear: 9 * 12 },
	{ name: 'DataBull', detail: 'Self-hosted, $49 once', firstYear: 49 },
	{ name: 'Grosslytics', detail: 'Self-hosted, $0', firstYear: 0, ours: true },
];

// Matches GATEWAY_FEES in packages/shared/src/fees.ts
const GATEWAYS = [
	{ id: 'stripe', label: 'Stripe (2.9% + $0.30)', pct: 0.029, fixed: 0.3 },
	{ id: 'paddle', label: 'Paddle (5.0% + $0.50)', pct: 0.05, fixed: 0.5 },
	{ id: 'dodo', label: 'Dodo Payments (4.0% + $0.40)', pct: 0.04, fixed: 0.4 },
	{ id: 'polar', label: 'Polar (5.0% + $0.00)', pct: 0.05, fixed: 0 },
	{ id: 'lemonsqueezy', label: 'Lemon Squeezy (5.0% + $0.50)', pct: 0.05, fixed: 0.5 },
	{ id: 'paypal', label: 'PayPal (3.49% + $0.49)', pct: 0.0349, fixed: 0.49 },
	{ id: 'razorpay', label: 'Razorpay (2.0% + $0.00)', pct: 0.02, fixed: 0 },
	{ id: 'cashfree', label: 'Cashfree (1.95% + $0.00)', pct: 0.0195, fixed: 0 },
	{ id: 'gumroad', label: 'Gumroad (10.0% + $0.50)', pct: 0.1, fixed: 0.5 },
] as const;

const usd = (n: number) =>
	n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usdExact = (n: number) =>
	n.toLocaleString('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

export default function RoiCalculator() {
	const gatewayId = useId();
	const revenueId = useId();
	const priceId = useId();
	const [gatewayKey, setGatewayKey] = useState<(typeof GATEWAYS)[number]['id']>('stripe');
	const [revenue, setRevenue] = useState(10_000);
	const [price, setPrice] = useState(29);

	const gateway = GATEWAYS.find((g) => g.id === gatewayKey) ?? GATEWAYS[0];
	const max = Math.max(...PLANS.map((p) => p.firstYear));
	const sales = revenue / price;
	const yearlyGross = revenue * 12;
	const yearlyFees = (revenue * gateway.pct + sales * gateway.fixed) * 12;
	const yearlyNet = yearlyGross - yearlyFees;
	const feePerSale = price * gateway.pct + gateway.fixed;
	const gatewayName = gateway.label.split(' (')[0];
	const scheduleText = gateway.label.match(/\((.+)\)/)?.[1] ?? '';

	return (
		<div className="mx-auto max-w-[760px] rounded-[28px] bg-card p-8 ring-1 ring-line sm:p-10">
			<h3 className="text-[17px] font-semibold">First-year cost on the entry plan</h3>
			<ul className="tnum mt-6 space-y-4" aria-label="First-year cost on each entry plan">
				{PLANS.map((p) => (
					<li
						key={p.name}
						className="grid grid-cols-[9.5rem_1fr_3.5rem] items-center gap-4 text-[15px]"
					>
						<span className={p.ours ? 'font-semibold' : 'text-ink-2'}>
							{p.name}
							<span className="block text-[12px] text-ink-3">{p.detail}</span>
						</span>
						<span className="h-2 overflow-hidden rounded-full bg-band">
							<span
								className={`block h-full rounded-full ${p.ours ? 'bg-accent' : 'bg-ink-3/50'}`}
								style={{ width: `${Math.max(2, (p.firstYear / max) * 100)}%` }}
							/>
						</span>
						<span className={`text-right ${p.ours ? 'font-semibold' : ''}`}>
							{usd(p.firstYear)}
						</span>
					</li>
				))}
			</ul>
			<p className="mt-4 text-[12px] leading-relaxed text-ink-3">
				Published entry prices, checked Nov 6, 2026. Higher traffic tiers cost more on DataFast and
				Plausible. Hosted options: DataBull from $9/mo, Grosslytics $5.99/mo.
			</p>

			<div className="mt-10 border-t border-line pt-8">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<h3 className="text-[17px] font-semibold">How much of your revenue is fees?</h3>
					<div className="flex items-center gap-2.5">
						<label htmlFor={gatewayId} className="text-[13px] text-ink-2">
							Gateway
						</label>
						<select
							id={gatewayId}
							value={gatewayKey}
							onChange={(e) => setGatewayKey(e.target.value as (typeof GATEWAYS)[number]['id'])}
							className="rounded-xl bg-band px-3 py-1.5 text-[13px] font-medium text-ink ring-1 ring-line"
						>
							{GATEWAYS.map((g) => (
								<option key={g.id} value={g.id}>
									{g.label}
								</option>
							))}
						</select>
					</div>
				</div>
				<div className="mt-6 grid gap-8 sm:grid-cols-2">
					<div>
						<div className="mb-3 flex items-baseline justify-between">
							<label htmlFor={revenueId} className="text-[15px] text-ink-2">
								Monthly revenue
							</label>
							<span className="tnum text-[17px] font-semibold">{usd(revenue)}</span>
						</div>
						<input
							id={revenueId}
							type="range"
							min={1_000}
							max={100_000}
							step={1_000}
							value={revenue}
							onChange={(e) => setRevenue(Number(e.target.value))}
							className="w-full cursor-pointer accent-[var(--accent)]"
						/>
					</div>
					<div>
						<div className="mb-3 flex items-baseline justify-between">
							<label htmlFor={priceId} className="text-[15px] text-ink-2">
								Average sale
							</label>
							<span className="tnum text-[17px] font-semibold">{usd(price)}</span>
						</div>
						<input
							id={priceId}
							type="range"
							min={5}
							max={500}
							step={1}
							value={price}
							onChange={(e) => setPrice(Number(e.target.value))}
							className="w-full cursor-pointer accent-[var(--accent)]"
						/>
					</div>
				</div>
				<div className="mt-8 flex flex-wrap items-baseline gap-x-8 gap-y-3">
					<div>
						<p className="text-[12px] font-medium uppercase tracking-wide text-ink-3">
							Annual gateway fees
						</p>
						<p className="tnum mt-1 font-display text-[40px] font-semibold tracking-[-0.03em]">
							{usd(yearlyFees)}
							<span className="text-[20px] text-ink-3"> / year</span>
						</p>
					</div>
					<div>
						<p className="text-[12px] font-medium uppercase tracking-wide text-ink-3">
							Net revenue kept
						</p>
						<p className="tnum mt-1 font-display text-[28px] font-semibold tracking-[-0.02em] text-ink-2">
							{usd(yearlyNet)}
							<span className="text-[16px] text-ink-3"> / year</span>
						</p>
					</div>
				</div>
				<p className="mt-2 text-[15px] text-ink-2">
					goes to {gatewayName} at {scheduleText} per sale ({usdExact(feePerSale)} on a {usd(price)}{' '}
					order). Grosslytics shows each channel&apos;s revenue with this taken out.
				</p>
			</div>
		</div>
	);
}
