export function parseSetCookieHeader(setCookie: string | null): Record<string, string> {
	if (!setCookie) {
		return {};
	}

	const cookies: Record<string, string> = {};

	for (const part of setCookie.split(/,(?=[^;]+?=)/)) {
		const trimmed = part.trim();
		const separatorIndex = trimmed.indexOf('=');

		if (separatorIndex < 0) {
			continue;
		}

		const name = trimmed.slice(0, separatorIndex).trim();
		const value = trimmed.slice(separatorIndex + 1).split(';')[0]?.trim() ?? '';

		if (trimmed.toLowerCase().includes('expires=thu, 01 jan 1970')) {
			delete cookies[name];
		} else if (value) {
			cookies[name] = decodeURIComponent(value);
		}
	}

	return cookies;
}

export function getAllSetCookieHeaders(response: Response): string[] {
	if (typeof response.headers.getSetCookie === 'function') {
		return response.headers.getSetCookie();
	}

	const combined = response.headers.get('set-cookie');

	return combined ? [combined] : [];
}

export function mergeResponseCookies(jar: Record<string, string>, response: Response): Record<string, string> {
	const merged = { ...jar };

	for (const setCookie of getAllSetCookieHeaders(response)) {
		const parsed = parseSetCookieHeader(setCookie);

		for (const [name, value] of Object.entries(parsed)) {
			if (value) {
				merged[name] = value;
			} else {
				delete merged[name];
			}
		}
	}

	return merged;
}

export function cookieJarToHeader(jar: Record<string, string>): string | undefined {
	const entries = Object.entries(jar);

	if (entries.length === 0) {
		return undefined;
	}

	return entries.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; ');
}
