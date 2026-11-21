import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import Onboarding from './Onboarding';
import { trackerSnippet } from '../dashboard/api';

test('free onboarding shows the footer requirement before the tracker step', () => {
	const html = renderToStaticMarkup(<Onboarding />);
	expect(html).toContain('npx grosslytics@latest install --free');
	expect(html).toContain('npx grosslytics@latest update');
	expect(html).toMatch(/Verify your footer link.*Powered by Grosslytics.*Add the tracker to your site/);
});

test('self-hosted tracker and event URLs both use the connected deployment', () => {
	expect(trackerSnippet('gl_123', 'https://analytics.acme.io/')).toBe(
		'<script defer src="https://analytics.acme.io/g.js" data-site-id="gl_123" data-api="https://analytics.acme.io/api/event"></script>',
	);
	expect(trackerSnippet('gl_123', 'http://localhost:8787', 'http://localhost:4321')).toContain('src="http://localhost:4321/g.js"');
});
