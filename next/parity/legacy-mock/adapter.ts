import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECURITY_TXT_BODY } from '@/src/server/well-known/handlers';
import { generateNavigationETag, getAppsNavigation, getSettingsNavigation } from '@/src/server/ocs/navigation';
import { handleLegacyMockAuth, parseCookiesFromOptions } from './auth';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/legacy');

function loadFixture(name: string): unknown {
	const filePath = path.join(fixturesDir, name);

	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function hasValidBasicAuth(headers?: Record<string, string>): boolean {
	const authorization = headers?.authorization ?? headers?.Authorization;

	if (!authorization) {
		return false;
	}

	const expectedUser = process.env.NC_ADMIN_USER?.trim() || 'admin';
	const expectedPassword = process.env.NC_ADMIN_PASSWORD?.trim() || 'parity-test-password';
	const match = /^Basic\s+(.+)$/i.exec(authorization.trim());

	if (!match) {
		return false;
	}

	try {
		const decoded = Buffer.from(match[1], 'base64').toString('utf8');
		const separatorIndex = decoded.indexOf(':');

		if (separatorIndex < 0) {
			return false;
		}

		return decoded.slice(0, separatorIndex) === expectedUser
			&& decoded.slice(separatorIndex + 1) === expectedPassword;
	} catch {
		return false;
	}
}

function isMockAuthenticated(options: ParityRequestOptions): boolean {
	if (hasValidBasicAuth(options.headers)) {
		return true;
	}

	const cookies = parseCookiesFromOptions(options);

	return Boolean(cookies.nc_username);
}

function jsonSnapshot(
	status: number,
	body: unknown,
	contentType = 'application/json; charset=utf-8',
	extraHeaders: Record<string, string> = {},
): ParityResponseSnapshot {
	const rawBody = JSON.stringify(body);

	return snapshotResponse(
		new Response(rawBody, {
			status,
			headers: {
				'content-type': contentType,
				...extraHeaders,
			},
		}),
		rawBody,
	);
}

function textSnapshot(status: number, body: string, extraHeaders: Record<string, string> = {}): ParityResponseSnapshot {
	return snapshotResponse(
		new Response(body, {
			status,
			headers: {
				'content-type': 'text/plain; charset=UTF-8',
				...extraHeaders,
			},
		}),
		body,
	);
}

function redirectSnapshot(location: string, extraHeaders: Record<string, string> = {}): ParityResponseSnapshot {
	return snapshotResponse(
		new Response(null, {
			status: 303,
			headers: {
				location,
				...extraHeaders,
			},
		}),
		'',
	);
}

function unauthorizedSnapshot(): ParityResponseSnapshot {
	return jsonSnapshot(401, loadFixture('ocs-v2-unauthorized.json'));
}

function handleWellKnownMock(pathname: string, options: ParityRequestOptions): ParityResponseSnapshot | null {
	if (pathname === '/.well-known/change-password') {
		return redirectSnapshot('http://127.0.0.1:3100/index.php/settings/user/security', {
			'x-nextcloud-well-known': '1',
		});
	}

	if (pathname === '/.well-known/security.txt') {
		return textSnapshot(200, SECURITY_TXT_BODY, {
			'x-nextcloud-well-known': '1',
		});
	}

	if (pathname.startsWith('/.well-known/')) {
		const service = pathname.slice('/.well-known/'.length);

		return jsonSnapshot(404, { message: `${service} not supported` }, 'application/json', {
			'x-nextcloud-well-known': '1',
		});
	}

	return null;
}

function handleOcsProviderMock(pathname: string): ParityResponseSnapshot | null {
	if (pathname === '/ocs-provider/' || pathname === '/ocs-provider') {
		return jsonSnapshot(200, loadFixture('ocs-provider.json'));
	}

	return null;
}

function handleNavigationMock(fullPath: string, options: ParityRequestOptions): ParityResponseSnapshot | null {
	const origin = 'http://127.0.0.1:3100';
	const pathname = fullPath.split('?')[0];
	const url = new URL(`${origin}${fullPath.startsWith('/') ? fullPath : `/${fullPath}`}`);

	if (pathname.startsWith('/ocs/v2.php/core/navigation/apps')) {
		if (!isMockAuthenticated(options)) {
			return unauthorizedSnapshot();
		}

		const absolute = url.searchParams.get('absolute') === 'true';
		const navigation = getAppsNavigation(absolute, origin);
		const etag = generateNavigationETag(navigation);
		const ifNoneMatch = options.headers?.['if-none-match'] ?? options.headers?.['If-None-Match'];

		if (ifNoneMatch === etag) {
			return snapshotResponse(new Response(null, { status: 304 }), '');
		}

		return jsonSnapshot(200, loadFixture('ocs-v2-navigation-apps.json'), 'application/json; charset=utf-8', {
			etag,
		});
	}

	if (pathname.startsWith('/ocs/v2.php/core/navigation/settings')) {
		if (!isMockAuthenticated(options)) {
			return unauthorizedSnapshot();
		}

		const absolute = url.searchParams.get('absolute') === 'true';
		const navigation = getSettingsNavigation(absolute, origin);
		const etag = generateNavigationETag(navigation);
		const ifNoneMatch = options.headers?.['if-none-match'] ?? options.headers?.['If-None-Match'];

		if (ifNoneMatch === etag) {
			return snapshotResponse(new Response(null, { status: 304 }), '');
		}

		return jsonSnapshot(200, loadFixture('ocs-v2-navigation-settings.json'), 'application/json; charset=utf-8', {
			etag,
		});
	}

	return null;
}

function handleAutocompleteMock(fullPath: string, options: ParityRequestOptions): ParityResponseSnapshot | null {
	const pathname = fullPath.split('?')[0];

	if (!pathname.startsWith('/ocs/v2.php/core/autocomplete/get')) {
		return null;
	}

	if (!isMockAuthenticated(options)) {
		return unauthorizedSnapshot();
	}

	const url = new URL(`http://127.0.0.1:3100${fullPath.startsWith('/') ? fullPath : `/${fullPath}`}`);
	const limit = Number.parseInt(url.searchParams.get('limit') ?? '10', 10);

	if (Number.isNaN(limit) || limit < 1) {
		return jsonSnapshot(400, loadFixture('ocs-v2-autocomplete-limit-invalid.json'));
	}

	return jsonSnapshot(200, loadFixture('ocs-v2-autocomplete-alice.json'));
}

function handleHoverCardMock(pathname: string, options: ParityRequestOptions): ParityResponseSnapshot | null {
	const match = /^\/ocs\/v2\.php\/hovercard\/v1\/([^/]+)$/.exec(pathname);

	if (!match) {
		return null;
	}

	if (!isMockAuthenticated(options)) {
		return unauthorizedSnapshot();
	}

	const userId = decodeURIComponent(match[1]);

	if (userId === 'admin') {
		return jsonSnapshot(200, loadFixture('ocs-v2-hovercard-admin.json'));
	}

	return jsonSnapshot(404, loadFixture('ocs-v2-hovercard-not-found.json'));
}

export function fetchLegacyMockSnapshot(fullPath: string, options: ParityRequestOptions = {}): ParityResponseSnapshot {
	const method = (options.method ?? 'GET').toUpperCase();
	const pathname = fullPath.split('?')[0];
	const authResponse = handleLegacyMockAuth(pathname, options);

	if (authResponse) {
		return authResponse;
	}

	if (method === 'PUT' && pathname.includes('/cloud/capabilities')) {
		const isV1 = pathname.includes('/ocs/v1.php/');

		return jsonSnapshot(isV1 ? 200 : 405, {
			ocs: {
				meta: {
					status: 'failure',
					statuscode: 405,
					message: 'Method not allowed',
					...(isV1 ? { totalitems: '', itemsperpage: '' } : {}),
				},
				data: {},
			},
		});
	}

	if (method !== 'GET') {
		return jsonSnapshot(404, { message: `Legacy mock has no fixture for ${method} ${pathname}` });
	}

	const wellKnown = handleWellKnownMock(pathname, options);

	if (wellKnown) {
		return wellKnown;
	}

	const ocsProvider = handleOcsProviderMock(pathname);

	if (ocsProvider) {
		return ocsProvider;
	}

	const navigation = handleNavigationMock(fullPath, options);

	if (navigation) {
		return navigation;
	}

	const autocomplete = handleAutocompleteMock(fullPath, options);

	if (autocomplete) {
		return autocomplete;
	}

	const hoverCard = handleHoverCardMock(pathname, options);

	if (hoverCard) {
		return hoverCard;
	}

	if (pathname === '/status.php') {
		return jsonSnapshot(200, loadFixture('status.json'), 'application/json', {
			'access-control-allow-origin': '*',
		});
	}

	if (pathname.startsWith('/ocs/v2.php/cloud/capabilities')) {
		const fixture = hasValidBasicAuth(options.headers)
			? 'ocs-v2-capabilities-authenticated.json'
			: 'ocs-v2-capabilities-public.json';

		return jsonSnapshot(200, loadFixture(fixture));
	}

	if (pathname.startsWith('/ocs/v1.php/cloud/capabilities')) {
		const fixture = hasValidBasicAuth(options.headers)
			? 'ocs-v1-capabilities-authenticated.json'
			: 'ocs-v1-capabilities-public.json';

		return jsonSnapshot(200, loadFixture(fixture));
	}

	return jsonSnapshot(404, { message: `Legacy mock has no fixture for ${method} ${pathname}` });
}

export function usesLegacyMock(): boolean {
	return !process.env.LEGACY_BASE_URL?.trim();
}

const MOCKED_GET_PREFIXES = [
	'/.well-known/',
	'/ocs-provider',
	'/ocs/v2.php/core/navigation/',
	'/ocs/v2.php/core/autocomplete/',
	'/ocs/v2.php/hovercard/v1/',
];

const MOCKED_GET_ROUTES = new Set([
	'/status.php',
	'/ocs/v1.php/cloud/capabilities',
	'/ocs/v2.php/cloud/capabilities',
	'/csrftoken',
	'/login',
	'/logout',
]);

export function hasLegacyMockFixture(pathname: string, method = 'GET'): boolean {
	const normalizedMethod = method.toUpperCase();

	if (normalizedMethod === 'PUT' && pathname.includes('/cloud/capabilities')) {
		return true;
	}

	if (normalizedMethod === 'POST' && pathname === '/login') {
		return true;
	}

	if (normalizedMethod !== 'GET') {
		return false;
	}

	if (MOCKED_GET_ROUTES.has(pathname)) {
		return true;
	}

	return MOCKED_GET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
