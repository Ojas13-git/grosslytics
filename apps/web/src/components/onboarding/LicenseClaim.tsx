import { useEffect, useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { DEFAULT_API } from '../dashboard/api';
import { copyText } from '../../lib/clipboard';

type State = { kind: 'waiting' } | { kind: 'verify'; sessionId: string } | { kind: 'ready'; key: string } | { kind: 'error'; message: string };

const claim = (sessionId: string, code?: string) => fetch(`${DEFAULT_API || location.origin}/api/license/claim`, {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ sessionId, code }),
	cache: 'no-store',
});

/** Checkout returns here. Confirm the payment, then verify the purchase email before showing the key. */
export default function LicenseClaim() {
	const [state, setState] = useState<State>({ kind: 'waiting' });
	const [copied, setCopied] = useState('');
	const [code, setCode] = useState('');
	const [busy, setBusy] = useState(false);
	const [feedback, setFeedback] = useState('');

	useEffect(() => {
		const q = new URLSearchParams(location.search);
		const sessionId = q.get('payment_id') || q.get('session_id');
		if (!sessionId) return setState({ kind: 'error', message: 'This page opens after you buy Lifetime. The link from the checkout includes your purchase.' });
		history.replaceState(history.state, '', location.pathname);
		let tries = 0;
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			try {
				const res = await claim(sessionId);
				if (res.status === 202) return setState({ kind: 'verify', sessionId });
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				if (res.status !== 404) return setState({ kind: 'error', message: body.error || `Something went wrong (${res.status}).` });
			} catch {}
			// Payments usually confirm within seconds; give it two minutes
			if (++tries < 8) timer = setTimeout(poll, 8000);
			else setState({ kind: 'error', message: 'Your payment hasn’t been confirmed yet. Open the link from your receipt in a few minutes.' });
		};
		poll();
		return () => clearTimeout(timer);
	}, []);

	const copy = (value: string, what: string) => copyText(value).then((ok) => ok && setCopied(what));
	const command = 'npx grosslytics@latest install --lifetime';
	const verify = async (sessionId: string, providedCode?: string) => {
		setBusy(true);
		setFeedback('');
		try {
			const res = await claim(sessionId, providedCode);
			if (res.status === 202) return setFeedback('Check your purchase email for the verification code.');
			const body = (await res.json().catch(() => ({}))) as { key?: string; error?: string };
			if (res.ok && body.key) setState({ kind: 'ready', key: body.key });
			else setFeedback(body.error || 'Could not verify this code.');
		} catch {
			setFeedback('Could not reach Grosslytics. Try again.');
		} finally {
			setBusy(false);
		}
	};

	if (state.kind === 'waiting')
		return (
			<p className="flex items-center justify-center gap-2 text-ink-2" role="status">
				<Loader2 size={16} className="animate-spin" aria-hidden="true" />Confirming your payment…
			</p>
		);
	if (state.kind === 'error') return <p className="rounded-[22px] bg-card p-7 text-center text-ink-2 ring-1 ring-line" role="alert">{state.message}</p>;

	if (state.kind === 'verify') return (
		<form className="space-y-4 rounded-[22px] bg-card p-6 ring-1 ring-line" onSubmit={(event) => { event.preventDefault(); void verify(state.sessionId, code); }}>
			<p>Enter the verification code sent to your purchase email. The code expires after 15 minutes.</p>
			<label className="block">
				Verification code
				<input className="mt-1 block w-full rounded-lg bg-band p-2 font-mono ring-1 ring-line" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" maxLength={40} required />
			</label>
			<div className="flex flex-wrap gap-2">
				<button className="btn btn-primary" disabled={busy}>Claim license</button>
				<button type="button" className="btn btn-quiet" disabled={busy} onClick={() => verify(state.sessionId)}>Resend code</button>
			</div>
			{feedback && <p role="status">{feedback}</p>}
		</form>
	);

	const row = (label: string, value: string, what: string) => (
		<div>
			<p className="text-[13px] font-medium text-ink-2">{label}</p>
			<div className="mt-1 flex items-start gap-2 rounded-xl bg-band p-3">
				<code className="min-w-0 flex-1 break-all font-mono text-[14px]">{value}</code>
				<button type="button" className="btn btn-quiet shrink-0 !px-2 !py-1 !text-[13px]" onClick={() => copy(value, what)}>
					{copied === what ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
					{copied === what ? 'Copied' : 'Copy'}
				</button>
			</div>
		</div>
	);

	return (
		<div className="space-y-6 rounded-[22px] bg-card p-7 ring-1 ring-line">
			<p className="flex items-center gap-2 font-medium text-up" role="status"><Check size={16} aria-hidden="true" />Payment confirmed. Thank you.</p>
			{row('Your license key. Keep it somewhere safe; it installs and updates Grosslytics.', state.key, 'key')}
			{row('Then run this in a terminal (needs Node.js 22.12 or newer):', command, 'cmd')}
			<ol className="list-decimal space-y-1.5 pl-5 text-[15px] text-ink-2">
				<li>Paste the license key, and pick a hostname such as analytics.yourstartup.com on a domain you have on Cloudflare.</li>
				<li>Choose your dashboard password.</li>
				<li>Click <strong className="text-ink">Allow</strong> when Cloudflare asks. The installer creates the database, queues and workers in your account.</li>
				<li>Open your dashboard, add a site, and paste its script tag.</li>
			</ol>
			<p className="text-[13px] text-ink-3">To update later, run the same command again in the same folder. To recover your key, open your checkout receipt and verify your email again.</p>
		</div>
	);
}
