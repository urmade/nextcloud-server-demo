export function buildDefaultContentSecurityPolicy(): string {
	const directives = [
		"default-src 'none'",
		"base-uri 'none'",
		"manifest-src 'self'",
		"script-src 'self'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"font-src 'self' data:",
		"connect-src 'self'",
		"media-src 'self'",
		"frame-ancestors 'self'",
		"worker-src 'self'",
		"form-action 'self'",
	];

	return directives.join(';');
}
