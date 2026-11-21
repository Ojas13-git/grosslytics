#!/usr/bin/env node
import { intro, outro, text, password as secret, select, spinner, note, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';
import { Command } from 'commander';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { apiToml, checkDeployment, databaseId, deployedHost, DIR, download, downloadFree, ensure, guessZone, hashPassword, isHost, loadState, noindex, savedEdition, saveState, unpack, webToml, wrangler, type InstallState } from './install.js';
import { isNewerRelease, isReleaseTag, latestRelease } from '@grosslytics/shared/release';
import pkg from '../package.json' with { type: 'json' };

const program = new Command();

program
	.name('grosslytics')
	.description('Grosslytics: Ultra-fast, edge-native revenue attribution CLI')
	.version(pkg.version);

type InstallOptions = { from?: string; bundle?: string; free?: boolean; lifetime?: boolean };

program
	.command('install')
	.alias('init')
	.description('Install Grosslytics on Cloudflare, or update an existing install')
	.option('--free', 'Use the public release with the footer credit requirement')
	.option('--lifetime', 'Use a Lifetime license, including on an existing free installation')
	.option('--from <origin>', 'Where Lifetime licenses and releases are served')
	.option('--bundle <file>', 'Deploy a locally built bundle (bun run setup)')
	.action((opts: InstallOptions) => deploy(opts));

program
	.command('update')
	.description('Update the Grosslytics deployment saved in this folder')
	.action(() => deploy({}, true));

async function deploy(opts: InstallOptions, update = false) {
	mkdirSync(DIR, { recursive: true });
	const lock = join(DIR, 'deploy.lock');
	try {
		mkdirSync(lock);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
		throw new Error(`Another deployment has locked ${DIR}. If it was interrupted, remove the empty ${lock} directory after confirming it stopped.`);
	}
	const unlock = () => rmdirSync(lock);
	const interrupt = () => {
		unlock();
		process.exit(130);
	};
	process.once('SIGINT', interrupt);
	process.once('SIGTERM', interrupt);
	try {
		await deployLocked(opts, update);
	} finally {
		process.removeListener('SIGINT', interrupt);
		process.removeListener('SIGTERM', interrupt);
		unlock();
	}
}

async function deployLocked(opts: InstallOptions, update: boolean) {
	intro(pc.bgGreen(pc.black(' Grosslytics installer ')));
	const prev = loadState();
	const previousEdition = savedEdition(prev);
	if (update && !prev.host) throw new Error(`Run this command from the folder containing your ${DIR}/state.json.`);
	if (opts.free && previousEdition && previousEdition !== 'free') throw new Error('This folder belongs to a different Grosslytics edition.');
	if (previousEdition === 'operator' && !opts.bundle) throw new Error('Update the Grosslytics operator deployment with bun run setup.');
	if (opts.lifetime && (opts.free || opts.bundle)) throw new Error('--lifetime cannot be combined with --free or --bundle.');
	const ask = async (message: string, initial: string | undefined, validate: (v: string) => string | undefined, placeholder?: string, hidden = false) => {
		const check = (x: unknown) => validate(String(x ?? '').trim());
		const value = hidden ? await secret({ message, validate: check }) : await text({ message, initialValue: initial, placeholder, validate: check });
		if (isCancel(value)) throw new Error('Cancelled.');
		return String(value).trim();
	};

	const mode = opts.lifetime ? 'lifetime' : opts.free || (opts.bundle && !previousEdition) ? 'free' : previousEdition ?? 'lifetime';
	if (opts.from && (mode !== 'lifetime' || opts.bundle)) throw new Error('--from applies to Lifetime releases.');
	const releaseOrigin = opts.from || prev.releaseOrigin || 'https://grosslytics.com';
	const license = mode === 'lifetime'
		? process.env.GROSSLYTICS_LICENSE || prev.license || await ask('Your license key', undefined, (value) => value.startsWith('gl_lic_') ? undefined : 'Enter your Lifetime license key.', 'gl_lic_…')
		: '';
	const spinnerState = spinner();
	const step = async <T>(label: string, fn: () => T | Promise<T>): Promise<T> => {
		spinnerState.start(label);
		try {
			const result = await fn();
			spinnerState.stop(pc.green(label));
			return result;
		} catch (error) {
			spinnerState.stop(pc.red(`${label}: failed`));
			throw error;
		}
	};

	const bundle = opts.bundle && resolve(opts.bundle);
	const manifest = mode === 'free' && !bundle ? await step('Checking the stable release', () => latestRelease()) : null;
	if (manifest && prev.version && prev.passwordSet && !prev.pending && !isNewerRelease(manifest.version, prev.version)) {
		outro(`Grosslytics ${prev.version} is up to date.`);
		return;
	}
	const host = prev.host || (await ask('Grosslytics deployment hostname (API and dashboard)', undefined, (value) => isHost(value.toLowerCase()) ? undefined : 'Use a hostname like analytics.yourstartup.com', 'analytics.yourstartup.com')).toLowerCase();
	const zone = prev.zone || (await ask('Cloudflare zone for that hostname', guessZone(host), (value) => host === value || host.endsWith(`.${value}`) ? undefined : `${host} must be inside this domain`)).toLowerCase();
	if (!isHost(host) || !isHost(zone) || (host !== zone && !host.endsWith(`.${zone}`))) throw new Error('The saved deployment hostname or zone is invalid.');
	const edition = host === 'grosslytics.com' && bundle ? 'operator' : mode;
	const version = bundle
		? await step('Unpacking your build', () => unpack(bundle))
		: await step('Downloading the release', () => manifest ? downloadFree(manifest) : download(releaseOrigin, license));
	if (!bundle && edition === previousEdition && prev.version && prev.passwordSet && !prev.pending &&
		(version === prev.version || (isReleaseTag(version) && !isNewerRelease(version, prev.version)))) {
		outro(`Grosslytics ${prev.version} is up to date.`);
		return;
	}
	const password = prev.passwordSet ? '' : await ask('Choose your dashboard password', undefined, (value) => value.length >= 10 && value.length <= 200 ? undefined : 'Use 10 to 200 characters.', undefined, true);

	const requestedAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
	if (prev.accountId && requestedAccount && requestedAccount !== prev.accountId) {
		throw new Error('CLOUDFLARE_ACCOUNT_ID differs from the account saved for this deployment.');
	}
	const accountList = () => JSON.parse(wrangler(['whoami', '--json'], { quiet: true })) as { accounts?: Array<{ id: string; name: string }> };
	let me: ReturnType<typeof accountList>;
	try {
		me = accountList();
	} catch (error) {
		const result = error as { stdout?: Buffer; stderr?: Buffer };
		const output = String(result.stdout ?? '') + String(result.stderr ?? '');
		if (!/"loggedIn"\s*:\s*false|not authenticated|not logged in/i.test(output)) throw error;
		note('A browser window opens. Sign in to Cloudflare and click Allow.', 'Cloudflare sign-in');
		wrangler(['login']);
		me = accountList();
	}
	// Pin the account explicitly so Wrangler does not reuse the last account selected in this directory.
	const accounts = me.accounts ?? [];
	if (!accounts.length) throw new Error('Your Cloudflare login has no accounts.');
	const account = prev.accountId || requestedAccount || (accounts.length === 1 ? accounts[0]!.id : await select({
		message: 'Which Cloudflare account?',
		options: accounts.map(({ id, name }) => ({ value: id, label: name })),
	}));
	if (isCancel(account)) throw new Error('Cancelled.');
	if (!accounts.some(({ id }) => id === account)) throw new Error('The saved deployment account is unavailable in this Cloudflare login.');
	process.env.CLOUDFLARE_ACCOUNT_ID = account;

	const existing = await step('Checking this Cloudflare account', deployedHost);
	if (existing && (existing !== host || !prev.host)) {
		throw new Error(`This Cloudflare account already runs Grosslytics for ${existing}. Use the original installation folder to update it.`);
	}
	if (prev.passwordSet && !existing) throw new Error('Could not confirm the existing Worker in this Cloudflare account. Check your Cloudflare login and try again.');
	const state: InstallState = { ...prev, host, zone, edition, license, releaseOrigin, accountId: account, pending: true };
	saveState(state);

	if (!prev.passwordSet && !prev.databaseId) await step('Creating the database', () => ensure(['d1', 'create', 'grosslytics-db']));
	const dbId = await step('Finding the database', databaseId);
	if (prev.databaseId && prev.databaseId !== dbId) throw new Error('The database differs from the database saved for this deployment.');
	state.databaseId = dbId;
	saveState(state);
	await step('Checking the queues', () => {
		ensure(['queues', 'create', 'grosslytics-ingest']);
		ensure(['queues', 'create', 'grosslytics-ingest-dlq']);
	});
	await step('Applying database migrations', () => wrangler(['d1', 'execute', 'grosslytics-db', '--remote', '--yes', '--file', resolve(DIR, 'release', 'migrate.sql')], { quiet: true }));

	const api = join(DIR, 'release', 'api');
	const web = join(DIR, 'release', 'web');
	writeFileSync(join(api, 'wrangler.toml'), apiToml({ ...state, version, requireFooter: edition === 'free' }, dbId));
	writeFileSync(join(web, 'wrangler.toml'), webToml({ host }));
	noindex(host, join(web, 'dist'));
	await step('Deploying the API', () => wrangler(['deploy', '--keep-vars'], { cwd: api, quiet: true }));
	await step('Checking webhook credential encryption', () => {
		const secrets = JSON.parse(wrangler(['secret', 'list', '--format', 'json'], { cwd: api, quiet: true })) as { name: string }[];
		if (!secrets.some(({ name }) => name === 'SITE_SECRETS_KEY')) {
			wrangler(['secret', 'put', 'SITE_SECRETS_KEY'], { cwd: api, input: randomBytes(32).toString('hex'), quiet: true });
		}
	});

	if (!state.passwordSet) {
		const apiToken = randomBytes(32).toString('hex');
		await step('Setting the API key', () => wrangler(['secret', 'put', 'API_TOKEN'], { cwd: api, input: apiToken, quiet: true }));
		// The hash is hex and $-separated, so it is safe inside the SQL literal.
		const sql = `INSERT INTO owner_auth (id, password_hash) VALUES (1, '${hashPassword(password)}') ON CONFLICT (id) DO UPDATE SET password_hash = excluded.password_hash, failed_count = 0, locked_until = 0, updated_at = unixepoch();`;
		await step('Setting your dashboard password', () => wrangler(['d1', 'execute', 'grosslytics-db', '--remote', '--yes', '--command', sql], { quiet: true }));
		note(`API_TOKEN (save this in your password manager): ${pc.yellow(apiToken)}`, 'API access');
		state.passwordSet = true;
		saveState(state);
	}

	await step('Deploying the dashboard', () => wrangler(['deploy'], { cwd: web, quiet: true }));
	await step('Checking the deployed API, dashboard, and tracker', () => checkDeployment(host, version, edition));
	saveState({ ...state, version, pending: false });

	note([
		`Dashboard: ${pc.cyan(`https://${host}/app/`)}`,
		`Version: ${version}`,
		edition === 'free' ? 'In the dashboard, register the website you want to track and add the credit to that website’s homepage footer.' : '',
		`To update in this folder, run ${pc.cyan(bundle ? 'bun run setup' : 'npx grosslytics@latest update')}.`,
	].filter(Boolean).join('\n'), prev.passwordSet ? 'Updated' : 'Installed');
	outro('Grosslytics is ready.');
}

// 2. MCP stdio server: bridges an MCP client's stdio JSON-RPC to the hosted Streamable HTTP endpoint
program
	.command('mcp')
	.description('Run the Grosslytics MCP server over stdio (for Claude Code, Cursor, Windsurf)')
	.option('--site <siteId>', 'Grosslytics Site ID')
	.option('--url <origin>', 'Grosslytics API origin', 'https://grosslytics.com')
	.action((opts) => {
		const token = process.env.GROSSLYTICS_API_TOKEN;
		if (!opts.site || !token) {
			process.stderr.write('Usage: GROSSLYTICS_API_TOKEN=... grosslytics mcp --site <siteId> [--url <origin>]\n');
			process.exit(1);
		}
		const endpoint = `${opts.url}/api/mcp?site=${encodeURIComponent(opts.site)}`;
		const reply = (msg: unknown) => process.stdout.write(`${JSON.stringify(msg)}\n`);

		createInterface({ input: process.stdin }).on('line', async (line) => {
			if (!line.trim()) return;
			let id: unknown = null;
			try {
				id = JSON.parse(line).id ?? null;
			} catch {}
			try {
				const res = await fetch(endpoint, {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						accept: 'application/json, text/event-stream',
						authorization: `Bearer ${token}`,
					},
					body: line,
				});
				const text = await res.text();
				// Notifications get 202 with no body; only JSON bodies are valid protocol output
				if (text && res.headers.get('content-type')?.includes('json')) process.stdout.write(`${text.trim()}\n`);
				else if (id !== null && !res.ok) reply({ jsonrpc: '2.0', id, error: { code: -32000, message: `HTTP ${res.status}: ${text}` } });
			} catch (err) {
				if (id !== null) reply({ jsonrpc: '2.0', id, error: { code: -32000, message: String(err) } });
			}
		});
	});

program.parseAsync().catch((error: Error) => {
	cancel(error.message);
	process.exitCode = 1;
});

