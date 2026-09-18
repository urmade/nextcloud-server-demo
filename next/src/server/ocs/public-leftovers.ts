/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { checkPassword, getConfiguredCredentials } from '@/src/server/auth/credentials';
import { findParityUser } from '@/src/server/config/users';
import {
	ocsFailureResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';

const IDENTITY_PROOF_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAparityFixtureIdentityProof
KeyForPublicLeftoversSliceDoNotUseForRealCrypto1234567890ABCDEF==
-----END PUBLIC KEY-----`;

const OPENMETRICS_CONTENT_TYPE = 'application/openmetrics-text; version=1.0.0; charset=utf-8';

const DEFAULT_ALLOWED_RANGES = ['127.0.0.0/16', '::1/128'];

function getRequestHost(request: Request): string {
	const forwardedHost = request.headers.get('x-forwarded-host');
	const host = forwardedHost ?? request.headers.get('host') ?? '127.0.0.1:3100';

	return host.split(',')[0]?.trim() ?? '127.0.0.1:3100';
}

function parsePersonCheckBody(request: Request): Promise<{ login: string; password: string }> {
	return request.json().then(
		(body: { login?: string; password?: string }) => ({
			login: typeof body.login === 'string' ? body.login : '',
			password: typeof body.password === 'string' ? body.password : '',
		}),
		() => ({ login: '', password: '' }),
	);
}

function getAllowedClientRanges(): string[] {
	const pinned = process.env.NC_PARITY_METRICS_ALLOWED_CLIENTS?.trim();

	if (pinned) {
		return pinned.split(',').map((entry) => entry.trim()).filter(Boolean);
	}

	const configured = process.env.NC_OPENMETRICS_ALLOWED_CLIENTS?.trim();

	if (configured) {
		return configured.split(',').map((entry) => entry.trim()).filter(Boolean);
	}

	return DEFAULT_ALLOWED_RANGES;
}

function getRemoteAddress(request: Request): string {
	const parityHeader = request.headers.get('x-parity-remote-addr')?.trim();

	if (parityHeader) {
		return parityHeader;
	}

	const parityAddr = process.env.NC_PARITY_METRICS_REMOTE_ADDR?.trim();

	if (parityAddr) {
		return parityAddr;
	}

	const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

	if (forwardedFor) {
		return forwardedFor;
	}

	return '127.0.0.1';
}

function ipv4ToInt(address: string): number | null {
	const parts = address.split('.');

	if (parts.length !== 4) {
		return null;
	}

	let value = 0;

	for (const part of parts) {
		const octet = Number(part);

		if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
			return null;
		}

		value = (value << 8) + octet;
	}

	return value >>> 0;
}

function isIpv4InCidr(address: string, cidr: string): boolean {
	const [network, prefixLengthRaw] = cidr.split('/');
	const prefixLength = Number(prefixLengthRaw);

	if (!network || !Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) {
		return false;
	}

	const addressInt = ipv4ToInt(address);
	const networkInt = ipv4ToInt(network);

	if (addressInt === null || networkInt === null) {
		return false;
	}

	const mask = prefixLength === 0 ? 0 : (~0 << (32 - prefixLength)) >>> 0;

	return (addressInt & mask) === (networkInt & mask);
}

function normalizeIpv6(address: string): string[] | null {
	let value = address.toLowerCase();

	if (value.includes('%')) {
		value = value.split('%')[0] ?? value;
	}

	if (value.includes('.')) {
		const lastColon = value.lastIndexOf(':');
		const suffix = value.slice(lastColon + 1);
		const v4 = ipv4ToInt(suffix);

		if (v4 === null) {
			return null;
		}

		const high = (v4 >>> 16) & 0xffff;
		const low = v4 & 0xffff;
		value = `${value.slice(0, lastColon)}:${((high << 16) + low).toString(16)}`;
	}

	const [head, tail] = value.includes('::') ? value.split('::') : [value, ''];
	const headParts = head ? head.split(':').filter(Boolean) : [];
	const tailParts = tail ? tail.split(':').filter(Boolean) : [];
	const missing = 8 - headParts.length - tailParts.length;

	if (missing < 0) {
		return null;
	}

	const parts = [
		...headParts,
		...Array.from({ length: missing }, () => '0'),
		...tailParts,
	].map((part) => part.padStart(4, '0'));

	return parts.length === 8 ? parts : null;
}

function expandIpv6(address: string): bigint | null {
	const parts = normalizeIpv6(address);

	if (!parts) {
		return null;
	}

	let value = 0n;

	for (const part of parts) {
		value = (value << 16n) + BigInt(parseInt(part, 16));
	}

	return value;
}

function isIpv6InCidr(address: string, cidr: string): boolean {
	const [network, prefixLengthRaw] = cidr.split('/');
	const prefixLength = Number(prefixLengthRaw);

	if (!network || !Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 128) {
		return false;
	}

	const addressValue = expandIpv6(address);
	const networkValue = expandIpv6(network);

	if (addressValue === null || networkValue === null) {
		return false;
	}

	const mask = prefixLength === 0
		? 0n
		: ((1n << BigInt(prefixLength)) - 1n) << BigInt(128 - prefixLength);

	return (addressValue & mask) === (networkValue & mask);
}

function isRemoteAddressAllowed(request: Request): boolean {
	const remoteAddress = getRemoteAddress(request);

	for (const range of getAllowedClientRanges()) {
		if (range.includes(':')) {
			if (isIpv6InCidr(remoteAddress, range)) {
				return true;
			}

			continue;
		}

		if (isIpv4InCidr(remoteAddress, range)) {
			return true;
		}
	}

	return false;
}

export async function handleOcsGetConfig(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);

	return ocsSuccessResponse(
		{
			version: '1.7',
			website: 'Nextcloud',
			host: getRequestHost(request),
			contact: '',
			ssl: 'false',
		},
		ocsVersion,
	);
}

export async function handleOcsPersonCheck(request: Request): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const { login, password } = await parsePersonCheckBody(request);

	if (login === '' || password === '') {
		return ocsFailureResponse(ocsVersion, 101, '', []);
	}

	if (!checkPassword(login, password)) {
		return ocsFailureResponse(ocsVersion, 102, '', []);
	}

	return ocsSuccessResponse(
		{
			person: {
				personid: login,
			},
		},
		ocsVersion,
	);
}

export async function handleOcsGetIdentityProof(request: Request, cloudId: string): Promise<Response> {
	const ocsVersion = parseOcsVersion(request);
	const user = findParityUser(cloudId);

	if (!user) {
		return ocsFailureResponse(ocsVersion, 404, '', ['Account not found']);
	}

	return ocsSuccessResponse(
		{
			public: IDENTITY_PROOF_PEM,
		},
		ocsVersion,
	);
}

export function handleOpenMetricsExport(request: Request): Response {
	if (!isRemoteAddressAllowed(request)) {
		return new Response('', { status: 403 });
	}

	const body = [
		'# TYPE nextcloud_parity_fixture gauge',
		'# UNIT nextcloud_parity_fixture count',
		'# HELP nextcloud_parity_fixture Parity fixture metric family',
		'nextcloud_parity_fixture 1',
		'# TYPE nextcloud_exporter_run_seconds gauge',
		'# UNIT nextcloud_exporter_run_seconds seconds',
		'# HELP nextcloud_exporter_run_seconds Exporter run time',
		'nextcloud_exporter_run_seconds 0.001',
		'# EOF',
		'',
	].join('\n');

	return new Response(body, {
		status: 200,
		headers: {
			'content-type': OPENMETRICS_CONTENT_TYPE,
		},
	});
}

export function getParityAdminCredentials(): { username: string; password: string } {
	return getConfiguredCredentials();
}
