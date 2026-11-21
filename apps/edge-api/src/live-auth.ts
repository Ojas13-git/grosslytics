import { hashToken } from './auth.js';
import type { Bindings } from './env.js';

export interface LiveGrant {
	kind: 'master' | 'pat' | 'owner' | 'account';
	hash: string;
	siteId: string;
}

export async function liveAuthorized(env: Bindings, grant: LiveGrant): Promise<boolean> {
	if (grant.kind === 'master') return !!env.API_TOKEN && await hashToken(env.API_TOKEN) === grant.hash;
	if (grant.kind === 'pat') return !!(await env.DB.prepare('SELECT 1 FROM api_tokens WHERE token_hash = ? AND site_id = ?').bind(grant.hash, grant.siteId).first());
	if (grant.kind === 'owner' && env.CLOUD !== '1') {
		return !!(await env.DB.prepare('SELECT 1 FROM sessions WHERE id_hash = ? AND expires_at > unixepoch()').bind(grant.hash).first());
	}
	if (grant.kind === 'account' && env.CLOUD === '1') {
		return !!(await env.DB.prepare('SELECT 1 FROM account_sessions s JOIN account_sites a ON a.account_id = s.account_id JOIN verified_accounts v ON v.account_id = s.account_id WHERE s.id_hash = ? AND a.site_id = ? AND s.expires_at > unixepoch()').bind(grant.hash, grant.siteId).first());
	}
	return false;
}

export async function redeemLiveTicket(env: Bindings, request: Request, siteId: string): Promise<LiveGrant | null> {
	const protocols = request.headers.get('sec-websocket-protocol')?.split(',').map((p) => p.trim()) ?? [];
	const ticket = protocols.find((p) => /^gl_live_[a-f0-9]{40}$/.test(p));
	if (!ticket || !protocols.includes('grosslytics-live')) return null;
	const grant = await env.DB.prepare('DELETE FROM live_tickets WHERE ticket_hash = ? AND site_id = ? AND expires_at > unixepoch() RETURNING kind, credential_hash AS hash, site_id AS siteId').bind(await hashToken(ticket), siteId).first<LiveGrant>();
	return grant && await liveAuthorized(env, grant) ? grant : null;
}
