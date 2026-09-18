import { describe, expect, it } from 'vitest';
import { createCsrfToken, decryptCsrfToken, encryptCsrfToken, isCsrfTokenValid } from './csrf';

describe('csrf', () => {
	it('encrypts and decrypts a token round-trip', () => {
		const { raw, encrypted } = createCsrfToken();

		expect(encrypted).toContain(':');
		expect(decryptCsrfToken(encrypted)).toBe(raw);
	});

	it('validates encrypted and raw tokens', () => {
		const { raw, encrypted } = createCsrfToken();

		expect(isCsrfTokenValid(raw, encrypted)).toBe(true);
		expect(isCsrfTokenValid(raw, raw)).toBe(true);
		expect(isCsrfTokenValid(raw, 'invalid')).toBe(false);
	});

	it('produces different encrypted values for the same raw token', () => {
		const raw = 'test-token-value-32chars-long!!';
		const first = encryptCsrfToken(raw);
		const second = encryptCsrfToken(raw);

		expect(first).not.toBe(second);
		expect(decryptCsrfToken(first)).toBe(raw);
		expect(decryptCsrfToken(second)).toBe(raw);
	});
});
