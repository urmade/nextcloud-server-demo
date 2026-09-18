import { describe, expect, it } from 'vitest';
import {
	cookieCheckRequired,
	passesLaxCookieCheck,
	passesStrictCookieCheck,
	parseCookieHeader,
	SAME_SITE_LAX,
	SAME_SITE_STRICT,
	SESSION_COOKIE,
	TOKEN_COOKIE,
} from './cookies';

describe('cookies', () => {
	it('does not require cookie check on first visit', () => {
		expect(cookieCheckRequired({}, false)).toBe(false);
		expect(passesStrictCookieCheck({}, false)).toBe(true);
	});

	it('requires same-site cookies when session cookie is present', () => {
		const cookies = { [SESSION_COOKIE]: 'abc' };

		expect(cookieCheckRequired(cookies, false)).toBe(true);
		expect(passesStrictCookieCheck(cookies, false)).toBe(false);
	});

	it('passes strict check when both same-site cookies are set', () => {
		const cookies = {
			[SESSION_COOKIE]: 'abc',
			[SAME_SITE_LAX]: 'true',
			[SAME_SITE_STRICT]: 'true',
		};

		expect(passesStrictCookieCheck(cookies, false)).toBe(true);
	});

	it('requires cookie check when nc_token is present', () => {
		const cookies = { [TOKEN_COOKIE]: 'token' };

		expect(cookieCheckRequired(cookies, false)).toBe(true);
	});

	it('parses cookie header values', () => {
		const parsed = parseCookieHeader('nc_session_id=abc123; nc_token=xyz');

		expect(parsed.nc_session_id).toBe('abc123');
		expect(parsed.nc_token).toBe('xyz');
	});
});
