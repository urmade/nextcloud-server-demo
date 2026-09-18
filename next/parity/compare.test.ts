import { describe, expect, it } from 'vitest';
import { compareParityResponses } from './compare';
import type { ParityResponseSnapshot } from './types';

function snapshot(
	status: number,
	headers: Record<string, string>,
	body: unknown,
): ParityResponseSnapshot {
	const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
	const parsedBody = typeof body === 'string' ? JSON.parse(body.trim()) : body;

	return {
		status,
		headers,
		body: parsedBody,
		rawBody,
	};
}

describe('compareParityResponses', () => {
	it('ignores insignificant whitespace in JSON bodies', () => {
		const legacy = snapshot(200, { 'content-type': 'application/json' }, { status: 'ok' });
		const newResponse = snapshot(200, { 'content-type': 'application/json' }, '{\n  "status": "ok"\n}');

		expect(compareParityResponses(legacy, newResponse)).toEqual([]);
	});

	it('compares contract headers only', () => {
		const legacy = snapshot(
			200,
			{ 'content-type': 'application/json', date: 'Mon, 01 Jan 2024 00:00:00 GMT' },
			{ ready: true },
		);
		const newResponse = snapshot(
			200,
			{ 'content-type': 'application/json', date: 'Tue, 02 Jan 2024 00:00:00 GMT' },
			{ ready: true },
		);

		expect(
			compareParityResponses(legacy, newResponse, {
				contractHeaders: ['content-type'],
			}),
		).toEqual([]);
	});

	it('applies timestamp tolerance at configured paths', () => {
		const legacy = snapshot(200, { 'content-type': 'application/json' }, {
			updatedAt: '2024-01-01T00:00:00.000Z',
		});
		const newResponse = snapshot(200, { 'content-type': 'application/json' }, {
			updatedAt: '2024-01-01T00:00:02.000Z',
		});

		expect(
			compareParityResponses(legacy, newResponse, {
				timestampPaths: ['updatedAt'],
				timestampToleranceMs: 5_000,
			}),
		).toEqual([]);
	});

	it('normalizes unstable ids via fixture paths', () => {
		const legacy = snapshot(200, { 'content-type': 'application/json' }, { id: 'legacy-id' });
		const newResponse = snapshot(200, { 'content-type': 'application/json' }, { id: 'new-id' });

		expect(
			compareParityResponses(legacy, newResponse, {
				unstableIdPaths: ['id'],
			}),
		).toEqual([]);
	});

	it('compares unordered lists semantically', () => {
		const legacy = snapshot(200, { 'content-type': 'application/json' }, { tags: ['b', 'a'] });
		const newResponse = snapshot(200, { 'content-type': 'application/json' }, { tags: ['a', 'b'] });

		expect(
			compareParityResponses(legacy, newResponse, {
				unorderedListPaths: ['body.tags'],
			}),
		).toEqual([]);
	});
});
