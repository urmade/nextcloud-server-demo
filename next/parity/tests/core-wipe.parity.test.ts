import { afterEach, describe, expect, it } from 'vitest';
import { resetAppPasswordStore } from '@/src/server/ocs/app-password-store';
import {
	ensureParityValidNotPendingToken,
	ensureParityWipePendingToken,
	PARITY_VALID_NOT_PENDING_TOKEN,
	PARITY_WIPE_PENDING_TOKEN,
} from '@/src/server/wipe/catalog';
import { resetWipeStore } from '@/src/server/wipe/store';
import { formatParityMismatches, runParityCase } from '../harness';

const JSON_HEADERS = {
	'content-type': 'application/json',
};

describe('parity: core wipe', () => {
	afterEach(() => {
		resetAppPasswordStore();
		resetWipeStore();
	});

	it('POST /index.php/core/wipe/check rejects unknown token (auth failure)', async () => {
		const result = await runParityCase({
			name: 'wipe-check-unknown-token',
			path: '/index.php/core/wipe/check',
			options: {
				method: 'POST',
				headers: JSON_HEADERS,
				body: JSON.stringify({ token: 'unknown-token-value' }),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /index.php/core/wipe/check rejects valid token not marked for wipe (validation)', async () => {
		ensureParityValidNotPendingToken();

		const result = await runParityCase({
			name: 'wipe-check-not-pending',
			path: '/index.php/core/wipe/check',
			options: {
				method: 'POST',
				headers: JSON_HEADERS,
				body: JSON.stringify({ token: PARITY_VALID_NOT_PENDING_TOKEN }),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /index.php/core/wipe/check happy path for wipe-pending token', async () => {
		ensureParityWipePendingToken();

		const result = await runParityCase({
			name: 'wipe-check-happy',
			path: '/index.php/core/wipe/check',
			options: {
				method: 'POST',
				headers: JSON_HEADERS,
				body: JSON.stringify({ token: PARITY_WIPE_PENDING_TOKEN }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['wipe'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /index.php/core/wipe/success rejects unknown token (auth failure)', async () => {
		const result = await runParityCase({
			name: 'wipe-success-unknown-token',
			path: '/index.php/core/wipe/success',
			options: {
				method: 'POST',
				headers: JSON_HEADERS,
				body: JSON.stringify({ token: 'unknown-token-value' }),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /index.php/core/wipe/success rejects valid token not marked for wipe (validation)', async () => {
		ensureParityValidNotPendingToken();

		const result = await runParityCase({
			name: 'wipe-success-not-pending',
			path: '/index.php/core/wipe/success',
			options: {
				method: 'POST',
				headers: JSON_HEADERS,
				body: JSON.stringify({ token: PARITY_VALID_NOT_PENDING_TOKEN }),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /index.php/core/wipe/success happy path invalidates wipe-pending token', async () => {
		ensureParityWipePendingToken();

		const result = await runParityCase({
			name: 'wipe-success-happy',
			path: '/index.php/core/wipe/success',
			options: {
				method: 'POST',
				headers: JSON_HEADERS,
				body: JSON.stringify({ token: PARITY_WIPE_PENDING_TOKEN }),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
