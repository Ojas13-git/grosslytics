import type { RateLimiter } from './env.js';

export function clientKey(request: Request): string {
	return request.headers.get('cf-connecting-ip') || 'unknown';
}

export async function limited(limiter: RateLimiter | undefined, key: string): Promise<boolean> {
	return !!limiter && !(await limiter.limit({ key })).success;
}
