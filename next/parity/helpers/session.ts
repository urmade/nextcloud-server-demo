import { getParityEnv } from '../env';
import { cookieJarToHeader, mergeResponseCookies } from '../helpers/cookies';

export async function loginParitySession(baseUrl = getParityEnv().newBaseUrl): Promise<Record<string, string>> {
	let jar: Record<string, string> = {};

	const csrfResponse = await fetch(`${baseUrl}/csrftoken`, {
		redirect: 'manual',
		headers: {
			cookie: cookieJarToHeader(jar) ?? '',
		},
	});
	jar = mergeResponseCookies(jar, csrfResponse);
	const csrfBody = await csrfResponse.json() as { token: string };

	const loginResponse = await fetch(`${baseUrl}/login`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			cookie: cookieJarToHeader(jar) ?? '',
		},
		body: new URLSearchParams({
			user: 'admin',
			password: 'parity-test-password',
			requesttoken: csrfBody.token,
		}).toString(),
	});

	return mergeResponseCookies(jar, loginResponse);
}

export function basicAuthHeader(username: string, password: string): Record<string, string> {
	const encoded = Buffer.from(`${username}:${password}`).toString('base64');

	return {
		Authorization: `Basic ${encoded}`,
	};
}

export const OCS_JSON_HEADERS = {
	'OCS-APIRequest': 'true',
	Accept: 'application/json',
};

export const OCS_META_PATHS = [
	'ocs.meta.status',
	'ocs.meta.statuscode',
	'ocs.meta.message',
];

export function exAppAuthHeaders(): Record<string, string> {
	return {
		...OCS_JSON_HEADERS,
		Authorization: 'Bearer parity-ex-app',
	};
}
