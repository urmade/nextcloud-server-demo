const WELL_KNOWN_HEADER = '1';

function getRequestOrigin(request: Request): string {
	const host = request.headers.get('host');

	if (host) {
		return `http://${host}`;
	}

	return new URL(request.url).origin;
}

export const SECURITY_TXT_BODY = `Contact: https://hackerone.com/nextcloud
Expires: 2027-03-31T23:00:00.000Z
Acknowledgments: https://hackerone.com/nextcloud/thanks
Acknowledgments: https://github.com/nextcloud/security-advisories/security/advisories
Policy: https://hackerone.com/nextcloud
Preferred-Languages: en
`;

const DAV_WELL_KNOWN_SERVICES = new Set(['caldav', 'carddav']);

export function handleWellKnown(service: string, request: Request): Response {
	if (DAV_WELL_KNOWN_SERVICES.has(service)) {
		const origin = getRequestOrigin(request);

		return new Response(null, {
			status: 301,
			headers: {
				location: `${origin}/remote.php/dav/`,
			},
		});
	}

	if (service === 'change-password') {
		const origin = getRequestOrigin(request);

		return new Response(null, {
			status: 303,
			headers: {
				location: `${origin}/index.php/settings/user/security`,
				'x-nextcloud-well-known': WELL_KNOWN_HEADER,
			},
		});
	}

	if (service === 'security.txt') {
		return new Response(SECURITY_TXT_BODY, {
			status: 200,
			headers: {
				'content-type': 'text/plain; charset=UTF-8',
				'x-nextcloud-well-known': WELL_KNOWN_HEADER,
			},
		});
	}

	return Response.json(
		{ message: `${service} not supported` },
		{
			status: 404,
			headers: {
				'x-nextcloud-well-known': WELL_KNOWN_HEADER,
			},
		},
	);
}
