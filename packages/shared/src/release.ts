export const RELEASES_URL = 'https://github.com/vidneat/grosslytics/releases';
export const RELEASE_ARCHIVE = 'grosslytics.tgz';
export const RELEASE_MANIFEST = 'grosslytics-release.json';
export const isReleaseTag = (value: unknown): value is string => typeof value === 'string' && /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(value);

export type ReleaseManifest = { version: string; sha256: string };

export async function latestRelease(signal = AbortSignal.timeout(5000)): Promise<ReleaseManifest> {
	const response = await fetch(`${RELEASES_URL}/latest/download/${RELEASE_MANIFEST}`, { signal });
	if (!response.ok) throw new Error(`Could not find the official release (HTTP ${response.status}).`);
	const manifest = await response.json() as Partial<ReleaseManifest> | null;
	if (!isReleaseTag(manifest?.version) || typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256)) {
		throw new Error('The official release manifest is invalid.');
	}
	return { version: manifest.version, sha256: manifest.sha256 };
}

/** Local source builds use a date and commit. The first update switches those installs to stable releases. */
export function isNewerRelease(next: string, installed: string): boolean {
	if (!isReleaseTag(next)) return false;
	if (!isReleaseTag(installed)) return true;
	const parts = installed.slice(1).split('.').map(Number);
	for (const [index, part] of next.slice(1).split('.').map(Number).entries()) {
		const difference = part - parts[index]!;
		if (difference) return difference > 0;
	}
	return false;
}
