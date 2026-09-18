import { describe, expect, it } from 'vitest';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';

function normalizeLocation(location: string | null | undefined): string | null {
	if (!location) {
		return null;
	}

	try {
		const url = new URL(location, 'http://localhost');

		return `${url.pathname}${url.search}`;
	} catch {
		return location;
	}
}

describe('parity: dav well-known discovery', () => {
	it('GET /.well-known/caldav redirects to the DAV root', async () => {
		const result = await runParityCase({
			name: 'well-known-caldav',
			path: '/.well-known/caldav',
			compare: {
				contractHeaders: ['location'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/.well-known/caldav`, { redirect: 'manual' });

		expect(response.status).toBe(301);
		expect(normalizeLocation(response.headers.get('location'))).toBe('/remote.php/dav/');
		expect(response.headers.get('x-nextcloud-well-known')).toBeNull();
	});

	it('GET /.well-known/carddav redirects to the DAV root', async () => {
		const result = await runParityCase({
			name: 'well-known-carddav',
			path: '/.well-known/carddav',
			compare: {
				contractHeaders: ['location'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/.well-known/carddav`, { redirect: 'manual' });

		expect(response.status).toBe(301);
		expect(normalizeLocation(response.headers.get('location'))).toBe('/remote.php/dav/');
		expect(response.headers.get('x-nextcloud-well-known')).toBeNull();
	});
});
