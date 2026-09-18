export function normalizeAvatarSize(size: number): 64 | 512 {
	const parsed = Number.parseInt(String(size), 10);

	if (Number.isNaN(parsed) || parsed <= 64) {
		return 64;
	}

	return 512;
}

export function binaryResponse(
	bytes: Buffer,
	status: number,
	contentType: string,
	extraHeaders: Record<string, string> = {},
): Response {
	const headers = new Headers({
		'content-type': contentType,
		'content-length': String(bytes.length),
		...extraHeaders,
	});

	return new Response(new Uint8Array(bytes), {
		status,
		headers,
	});
}

export function cacheForSeconds(response: Response, seconds: number): Response {
	const headers = new Headers(response.headers);
	headers.set('cache-control', `private, max-age=${seconds}`);

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export function jsonArrayResponse(status: number): Response {
	return new Response('[]', {
		status,
		headers: {
			'content-type': 'application/json; charset=utf-8',
		},
	});
}
