/**
 * Builds the prebuilt bundle used by free and Lifetime installs.
 *   bun scripts/release.ts            build .release/grosslytics.tgz
 *   bun scripts/release.ts --upload   also put it in R2 as grosslytics-releases/latest.tgz (needs `wrangler login`)
 *   bun scripts/release.ts --keep-env keep PUBLIC_* build settings (`bun run setup`, deploying your own copy)
 *   bun scripts/release.ts --tag v1.2.3  build a tagged release and checksum manifest
 * Bundle: api/index.js (pre-bundled edge API), web/dist (the built site + dashboard), migrate.sql, VERSION.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { ALL_MIGRATIONS } from '../packages/db-d1/src/migrations.ts';
import { isReleaseTag, RELEASE_ARCHIVE, RELEASE_MANIFEST } from '../packages/shared/src/release.ts';

const OUT = '.release';
const run = (cmd: string, args: string[], env?: NodeJS.ProcessEnv) => execFileSync(cmd, args, { stdio: 'inherit', env });
const tagIndex = process.argv.indexOf('--tag');
const tag = tagIndex === -1 ? undefined : process.argv[tagIndex + 1];
const keepEnv = process.argv.includes('--keep-env');
if (tagIndex !== -1 && (!isReleaseTag(tag) || keepEnv)) throw new Error('Use --tag vMAJOR.MINOR.PATCH for an official release.');
if (keepEnv && process.argv.includes('--upload')) throw new Error('Build without --keep-env when uploading a public release.');

// A wrong ID still deploys cleanly, then silently records no visits. Format matches the IDs from POST /api/stats/sites
const ownSiteId = keepEnv && process.env.PUBLIC_OWN_SITE_ID;
if (ownSiteId && !/^gl_[0-9a-f]{12}$/.test(ownSiteId)) {
	console.error(`PUBLIC_OWN_SITE_ID "${ownSiteId}" is not a real site ID. Copy it from the site's script tag on /app (gl_ followed by 12 letters and digits). Nothing was built or deployed.`);
	process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/bundle/web`, { recursive: true });

// Buyers' sites must not carry the operator's checkout links or API URL
const cleanEnv = keepEnv ? process.env : {
	...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PUBLIC_'))),
	GROSSLYTICS_OFFICIAL_BUILD: '1',
};
run('bun', ['run', '--cwd', 'packages/tracker', 'build']);
cpSync('packages/tracker/dist/g.js', 'apps/web/public/g.js');
cpSync('packages/tracker/dist/c.js', 'apps/web/public/c.js');
run('bun', ['run', '--cwd', 'apps/web', 'build'], cleanEnv);
const webDist = `${OUT}/bundle/web/dist`;
cpSync('apps/web/dist/client', webDist, { recursive: true });
cpSync('apps/web/dist/server', `${webDist}/_worker.js`, {
	recursive: true,
	filter: (path) => !path.endsWith('.map') && !path.endsWith('/wrangler.json'),
});
writeFileSync(`${webDist}/_worker.js/index.js`, "export { default } from './entry.mjs';\n");
run('bunx', ['wrangler', 'deploy', '--dry-run', '--outdir', `${OUT}/bundle/api`]);
rmSync(`${OUT}/bundle/api/index.js.map`, { force: true });
rmSync(`${OUT}/bundle/api/README.md`, { force: true });

// D1 manages journal mode itself and rejects these pragmas (same as scripts/db.ts)
writeFileSync(`${OUT}/bundle/migrate.sql`, ALL_MIGRATIONS.replace(/^PRAGMA .*$/gm, ''));
const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
const version = tag ?? `${new Date().toISOString().slice(0, 10)}-${sha}`;
writeFileSync(`${OUT}/bundle/VERSION`, version);
writeFileSync(`${webDist}/grosslytics-version.json`, JSON.stringify({ version }));
cpSync('LICENSE', `${OUT}/bundle/LICENSE`);
if (tag) writeFileSync(`${OUT}/bundle/SOURCE`, `https://github.com/vidneat/grosslytics/tree/${tag}\n`);

const archive = `${OUT}/${RELEASE_ARCHIVE}`;
run('tar', ['-czf', archive, '-C', `${OUT}/bundle`, '.']);
if (tag) {
	const sha256 = createHash('sha256').update(readFileSync(archive)).digest('hex');
	writeFileSync(`${OUT}/${RELEASE_MANIFEST}`, JSON.stringify({ version, sha256 }) + '\n');
}
console.log(`\nBuilt ${OUT}/grosslytics.tgz (${version})`);

if (process.argv.includes('--upload')) {
	run('bunx', ['wrangler', 'r2', 'object', 'put', 'grosslytics-releases/latest.tgz', '--file', `${OUT}/grosslytics.tgz`, '--content-type', 'application/gzip', '--remote']);
	console.log('Uploaded as latest.tgz. Every license holder gets it on their next `npx grosslytics install`.');
}
