import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSessionStore } from '@/src/server/auth/session-store';
import { resetDavFileStore } from '@/src/server/dav/store';
import { PARITY_DIRECT_EDIT_TOKEN } from '@/src/server/files/direct-editing-store';
import { resetFilesApiStores } from '@/src/server/files/api';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { cookieJarToHeader } from '../helpers/cookies';
import { resetParityFilesStores } from '../helpers/files';
import { loginParitySession } from '../helpers/session';

const HTML_HEADERS = {
	Accept: 'text/html,application/xhtml+xml',
};

const JSON_HEADERS = {
	Accept: 'application/json',
};

const HTML_COMPARE = {
	contractHeaders: ['content-type', 'content-security-policy'],
};

const REDIRECT_COMPARE = {
	contractHeaders: ['location'],
};

const JSON_AUTH_COMPARE = {
	contractHeaders: ['content-type'],
	includeBodyPaths: ['message'],
};

function normalizeLocation(location: string | null | undefined): string | null {
	if (!location) {
		return null;
	}

	try {
		const url = new URL(location, 'http://127.0.0.1:3100');

		return `${url.pathname}${url.search}`;
	} catch {
		return location;
	}
}

describe('parity: files-html-shell', () => {
	beforeEach(async () => {
		await resetParityFilesStores();
	});

	afterEach(async () => {
		resetSessionStore();
		resetDavFileStore();
		resetFilesApiStores();
		await resetParityFilesStores();
	});

	it('GET /apps/files/ logged-in returns HTML shell', async () => {
		const jar = await loginParitySession();
		const result = await runParityCase({
			name: 'files-view-index-happy',
			path: '/apps/files/',
			options: {
				headers: {
					...HTML_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/apps/files/`, {
			redirect: 'manual',
			headers: {
				...HTML_HEADERS,
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');
	});

	it('GET /index.php/apps/files/ logged-in returns HTML shell', async () => {
		const jar = await loginParitySession();
		const result = await runParityCase({
			name: 'files-view-index-indexphp-happy',
			path: '/index.php/apps/files/',
			options: {
				headers: {
					...HTML_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /apps/files/{view} logged-in returns HTML shell', async () => {
		const jar = await loginParitySession();
		const result = await runParityCase({
			name: 'files-view-index-view-happy',
			path: '/apps/files/files',
			options: {
				headers: {
					...HTML_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /apps/files/{view}/{fileid} logged-in returns HTML shell', async () => {
		const jar = await loginParitySession();
		const result = await runParityCase({
			name: 'files-view-index-view-fileid-happy',
			path: '/apps/files/files/1001',
			options: {
				headers: {
					...HTML_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: HTML_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /apps/files/ unauthenticated HTML redirects to login', async () => {
		const result = await runParityCase({
			name: 'files-view-index-unauth-html',
			path: '/apps/files/',
			options: {
				headers: HTML_HEADERS,
			},
			compare: REDIRECT_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/apps/files/`, {
			redirect: 'manual',
			headers: HTML_HEADERS,
		});

		expect(response.status).toBe(303);
		expect(normalizeLocation(response.headers.get('location'))).toBe('/login?redirect_url=%2Fapps%2Ffiles%2F');
	});

	it('GET /apps/files/ unauthenticated JSON returns 401 message', async () => {
		const result = await runParityCase({
			name: 'files-view-index-unauth-json',
			path: '/apps/files/',
			options: {
				headers: JSON_HEADERS,
			},
			compare: JSON_AUTH_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /f/{fileid} existing file always redirects into files view', async () => {
		const jar = await loginParitySession();
		const result = await runParityCase({
			name: 'files-show-file-happy',
			path: '/f/1001',
			options: {
				headers: {
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: REDIRECT_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/f/1001`, {
			redirect: 'manual',
			headers: {
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});

		expect(response.status).toBe(303);
		const location = normalizeLocation(response.headers.get('location'));

		expect(location).toContain('/apps/files/files/1001');
		expect(location).toContain('openfile=true');
	});

	it('GET /f/{fileid} missing file still redirects keeping fileid', async () => {
		const jar = await loginParitySession();
		const result = await runParityCase({
			name: 'files-show-file-missing',
			path: '/f/999999',
			options: {
				headers: {
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: REDIRECT_COMPARE,
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/f/999999`, {
			redirect: 'manual',
			headers: {
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});

		expect(response.status).toBe(303);
		expect(normalizeLocation(response.headers.get('location'))).toContain('/apps/files/files/999999');
	});

	it('GET /f/ empty fileid redirects to files index', async () => {
		const jar = await loginParitySession();
		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/f/`, {
			redirect: 'manual',
			headers: {
				cookie: cookieJarToHeader(jar) ?? '',
			},
		});

		expect(response.status).toBe(303);
		expect(normalizeLocation(response.headers.get('location'))).toBe('/index.php/apps/files/');
	});

	it('GET /apps/files/directEditing/{token} bad token returns 404 guest HTML', async () => {
		const result = await runParityCase({
			name: 'files-direct-editing-bad-token',
			path: '/apps/files/directEditing/invalid-token',
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);

		const env = getParityEnv();
		const response = await fetch(`${env.newBaseUrl}/apps/files/directEditing/invalid-token`, {
			redirect: 'manual',
		});

		expect(response.status).toBe(404);
		expect(response.headers.get('content-type')).toContain('text/html');
	});

	it('GET /apps/files/directEditing/{token} valid token returns editor HTML', async () => {
		const result = await runParityCase({
			name: 'files-direct-editing-happy',
			path: `/apps/files/directEditing/${PARITY_DIRECT_EDIT_TOKEN}`,
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /apps/files/directEditing/{token} spent token returns 404 not 401', async () => {
		const env = getParityEnv();
		const first = await fetch(`${env.newBaseUrl}/apps/files/directEditing/${PARITY_DIRECT_EDIT_TOKEN}`, {
			redirect: 'manual',
		});

		expect(first.status).toBe(200);

		const second = await fetch(`${env.newBaseUrl}/apps/files/directEditing/${PARITY_DIRECT_EDIT_TOKEN}`, {
			redirect: 'manual',
		});

		expect(second.status).toBe(404);
		expect(second.headers.get('content-type')).toContain('text/html');
		expect(second.status).not.toBe(401);
	});
});
