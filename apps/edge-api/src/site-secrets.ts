import type { PaymentGateway } from '@grosslytics/shared/types';
import type { Bindings } from './env.js';

const prefix = 'aes-gcm:v1:';
const encoder = new TextEncoder();
export const hasSiteSecretsKey = (secret: string | undefined) => !!secret && /^[0-9a-f]{64}$/i.test(secret);

async function encryptionKey(secret: string | undefined): Promise<CryptoKey> {
	if (!hasSiteSecretsKey(secret)) throw new Error('SITE_SECRETS_KEY must be a 32-byte hex key');
	const bytes = Uint8Array.from(secret!.match(/../g)!, (byte) => Number.parseInt(byte, 16));
	return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSiteSecret(env: Bindings, siteId: string, gateway: PaymentGateway, secret: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = new Uint8Array(await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv, additionalData: encoder.encode(JSON.stringify([siteId, gateway])) },
		await encryptionKey(env.SITE_SECRETS_KEY),
		encoder.encode(secret),
	));
	return prefix + btoa(String.fromCharCode(...iv, ...encrypted));
}

async function migrateSiteSecret(env: Bindings, siteId: string, gateway: PaymentGateway, secret: string): Promise<boolean> {
	const next = await encryptSiteSecret(env, siteId, gateway, secret);
	const result = await env.DB.prepare('UPDATE site_secrets SET secret = ? WHERE site_id = ? AND gateway = ? AND secret = ?')
		.bind(next, siteId, gateway, secret).run();
	return !!result.meta.changes;
}

export async function readSiteSecret(env: Bindings, siteId: string, gateway: PaymentGateway, stored: string): Promise<string | null> {
	if (!stored.startsWith(prefix)) {
		if (await migrateSiteSecret(env, siteId, gateway, stored)) return stored;
		const current = await env.DB.prepare('SELECT secret FROM site_secrets WHERE site_id = ? AND gateway = ?').bind(siteId, gateway).first<{ secret: string }>();
		if (!current?.secret.startsWith(prefix)) return null;
		stored = current.secret;
	}
	const data = Uint8Array.from(atob(stored.slice(prefix.length)), (char) => char.charCodeAt(0));
	return new TextDecoder().decode(await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: data.slice(0, 12), additionalData: encoder.encode(JSON.stringify([siteId, gateway])) },
		await encryptionKey(env.SITE_SECRETS_KEY),
		data.slice(12),
	));
}

export async function migrateSiteSecrets(env: Bindings): Promise<void> {
	if (!hasSiteSecretsKey(env.SITE_SECRETS_KEY)) return;
	const { results } = await env.DB.prepare('SELECT site_id, gateway, secret FROM site_secrets WHERE secret NOT LIKE ? LIMIT 100')
		.bind(`${prefix}%`).all<{ site_id: string; gateway: PaymentGateway; secret: string }>();
	for (const row of results) await migrateSiteSecret(env, row.site_id, row.gateway, row.secret);
}
