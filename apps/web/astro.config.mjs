import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const esc = (s) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
const decodeHtml = (s) =>
	s
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&mdash;/g, '—')
		.replace(/&ndash;/g, '–')
		.replace(/&nbsp;/g, ' ');
const FONT = 'font-family="Helvetica Neue, Helvetica, Arial, sans-serif"';

function collectLastModDates() {
	const map = new Map([
		['/', '2026-11-25'],
		['/docs/', '2026-11-25'],
		['/blog/', '2026-11-25'],
		['/compare/', '2026-11-25'],
		['/compare/ga4-alternative/', '2026-11-25'],
		['/authors/david-mill/', '2026-11-25'],
		['/tools/payment-fee-calculator/', '2026-11-25'],
		['/start/', '2026-11-24'],
		['/privacy/', '2026-11-17'],
		['/terms/', '2026-11-07'],
	]);
	for (const section of ['blog', 'compare']) {
		const dirUrl = new URL(`./src/pages/${section}/`, import.meta.url);
		for (const file of readdirSync(dirUrl)) {
			if (!file.endsWith('.md')) continue;
			const src = readFileSync(new URL(file, dirUrl), 'utf8');
			const updated = src.match(/^updatedDate:\s*["']?(\d{4}-\d{2}-\d{2})["']?/m)?.[1];
			const pub = src.match(/^pubDate:\s*["']?(\d{4}-\d{2}-\d{2})["']?/m)?.[1];
			const date = updated || pub;
			if (date) map.set(`/${section}/${file.replace(/\.md$/, '')}/`, date);
		}
	}
	return map;
}
const lastModByPath = collectLastModDates();

/** A 1200x630 PNG share card per built page, at /og/<path>.png (the homepage's is /og/index.png). X, LinkedIn and Facebook don't draw SVG cards. */
// shortcut: drawn with the build machine's own sans-serif font; bundle a font file if cards must look identical everywhere.
const ogCards = {
	name: 'og-cards',
	hooks: {
		'astro:build:done': ({ dir, pages }) => {
			for (const { pathname } of pages) {
				let html;
				try {
					html = readFileSync(new URL(`${pathname}index.html`, dir), 'utf8');
				} catch {
					continue; // not a page (404.html and the like)
				}
				const title = decodeHtml(html.match(/<title>(.*?)<\/title>/s)?.[1] ?? 'Grosslytics')
					.replace(/\s*[—|-]\s*Grosslytics.*$/, '')
					.replace(/^Grosslytics\s*[—|-]\s*/, '')
					.replace(/\s+/g, ' ')
					.trim();
				// SVG text doesn't wrap: break at about 28 characters, three lines at most
				const lines = title
					.split(' ')
					.reduce((l, w) => ((l.at(-1) + ' ' + w).trim().length <= 28 ? (l[l.length - 1] = (l.at(-1) + ' ' + w).trim()) : l.push(w), l), [''])
					.slice(0, 3);
				const fontSize = lines.length >= 3 || lines.some((t) => t.length > 25) ? 56 : 62;
				const lineStep = fontSize === 56 ? 70 : 76;
				const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
<rect width="1200" height="630" fill="#f5f5f7"/>
<rect x="80" y="84" width="40" height="11" rx="5.5" fill="#1d1d1f" opacity="0.28"/>
<rect x="80" y="103" width="27" height="11" rx="5.5" fill="#0071e3"/>
<text x="136" y="110" fill="#1d1d1f" ${FONT} font-size="28" font-weight="bold">Grosslytics</text>
${lines.map((t, i) => `<text x="80" y="${265 + i * lineStep}" fill="#1d1d1f" ${FONT} font-size="${fontSize}" font-weight="bold">${esc(t)}</text>`).join('\n')}
<text x="80" y="550" fill="#6e6e73" ${FONT} font-size="24">grosslytics.com · Gross is vanity. Net is what you keep.</text>
</svg>`;
				const out = fileURLToPath(new URL(`og/${pathname.replace(/\/$/, '') || 'index'}.png`, dir));
				mkdirSync(dirname(out), { recursive: true });
				writeFileSync(out, new Resvg(svg).render().asPng());
			}
		},
	},
};

// https://astro.build/config
export default defineConfig({
	site: 'https://grosslytics.com',
	output: 'static',
	session: false,
	markdown: { syntaxHighlight: false },
	adapter: cloudflare({
		imageService: 'passthrough',
		prerenderEnvironment: 'node',
	}),
	security: {
		csp: {
			directives: [
				"default-src 'self'",
				"base-uri 'self'",
				"object-src 'none'",
				"form-action 'self'",
				"img-src 'self' data: https:",
				"connect-src 'self' https: wss:",
			],
			scriptDirective: { resources: ["'self'"], strictDynamic: false },
			styleDirective: { resources: [{ resource: "'self'", kind: 'element' }, { resource: "'unsafe-inline'", kind: 'attribute' }] },
		},
	},
	integrations: [
		react(),
		sitemap({
			filter: (page) =>
				!page.includes('/app/') &&
				!page.includes('/api/') &&
				!page.includes('/badge/') &&
				!page.includes('/license') &&
				!page.includes('/404'),
			serialize: (item) => {
				const pathname = new URL(item.url).pathname;
				const date = lastModByPath.get(pathname);
				return date ? { ...item, lastmod: `${date}T00:00:00.000Z` } : item;
			},
		}),
		ogCards,
	],
	vite: {
		// Published bundles use defaults even when built from a checkout with local .env files.
		envDir: process.env.GROSSLYTICS_OFFICIAL_BUILD === '1' ? false : undefined,
		plugins: [tailwindcss()],
		// Dev mirrors production: /api/* on the site's own origin, so the dashboard's session cookie is first-party
		server: { proxy: { '/api': { target: 'http://localhost:8787', ws: true } } },
	},
});

