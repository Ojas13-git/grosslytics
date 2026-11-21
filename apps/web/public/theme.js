(() => {
	const root = document.documentElement;
	try {
		if (localStorage.getItem('gl_theme') === 'dark') root.dataset.theme = 'dark';
	} catch {}

	document.addEventListener('DOMContentLoaded', () => {
		const button = document.getElementById('theme-toggle');
		if (!button) return;
		const label = () => button.setAttribute('aria-label', root.dataset.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
		label();
		button.addEventListener('click', () => {
			const dark = root.dataset.theme !== 'dark';
			if (dark) root.dataset.theme = 'dark';
			else delete root.dataset.theme;
			try {
				localStorage.setItem('gl_theme', dark ? 'dark' : 'light');
			} catch {}
			label();
		});
	});
})();
