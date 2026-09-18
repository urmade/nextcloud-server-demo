import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleLegacyMockAuth } from './auth';
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

export function fetchLegacyMockSnapshot(pathname: string, options: ParityRequestOptions = {}): ParityResponseSnapshot {
	const method = (options.method ?? 'GET').toUpperCase();
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

	if (pathname === '/status.php' && method === 'GET') {
		return jsonSnapshot(200, loadFixture('status.json'), 'application/json', {
			'access-control-allow-origin': '*',
		});
	}

	if (pathname.startsWith('/ocs/v2.php/cloud/capabilities') && method === 'GET') {
		const fixture = hasValidBasicAuth(options.headers)
			? 'ocs-v2-capabilities-authenticated.json'
			: 'ocs-v2-capabilities-public.json';

		return jsonSnapshot(200, loadFixture(fixture));
	}

	if (pathname.startsWith('/ocs/v1.php/cloud/capabilities') && method === 'GET') {
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

	return normalizedMethod === 'GET' && MOCKED_GET_ROUTES.has(pathname);
}
