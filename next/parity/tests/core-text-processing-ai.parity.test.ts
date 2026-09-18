import { beforeEach, describe, expect, it } from 'vitest';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { fetchLegacyMockSnapshot, hasLegacyMockFixture } from '../legacy-mock/adapter';
import { compareBinarySnapshots, snapshotBinaryResponse } from '../helpers/binary';
import { cookieJarToHeader } from '../helpers/cookies';
import {
	loginParitySession,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
} from '../helpers/session';
import {
	PARITY_FREE_PROMPT_TYPE,
	PARITY_TEXT_PROCESSING_APP_ID,
} from '@/src/server/text-processing/catalog';
import {
	buildSeedTextProcessingTask,
	resetTextProcessingStore,
	seedParityTextProcessingTask,
} from '@/src/server/text-processing/store';
import { PARITY_TEXT_TO_IMAGE_APP_ID } from '@/src/server/text-to-image/catalog';
import {
	buildSeedTextToImageTask,
	resetTextToImageStore,
	seedParityTextToImageTask,
} from '@/src/server/text-to-image/store';

const TEXT_PROCESSING_UNSTABLE_PATHS = [
	'ocs.data.task.id',
	'ocs.data.task.completionExpectedAt',
];

const TEXT_TO_IMAGE_UNSTABLE_PATHS = [
	'ocs.data.task.id',
	'ocs.data.task.completionExpectedAt',
];

async function scheduleTextProcessingOnServer(
	jar: Record<string, string>,
	body: Record<string, unknown>,
): Promise<number> {
	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/ocs/v2.php/textprocessing/schedule?format=json`, {
		method: 'POST',
		headers: {
			...OCS_JSON_HEADERS,
			'content-type': 'application/json',
			cookie: cookieJarToHeader(jar) ?? '',
		},
		body: JSON.stringify(body),
	});
	const payload = await response.json() as { ocs: { data: { task: { id: number } } } };

	return payload.ocs.data.task.id;
}

async function scheduleTextToImageOnServer(
	jar: Record<string, string>,
	body: Record<string, unknown>,
): Promise<number> {
	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/ocs/v2.php/text2image/schedule?format=json`, {
		method: 'POST',
		headers: {
			...OCS_JSON_HEADERS,
			'content-type': 'application/json',
			cookie: cookieJarToHeader(jar) ?? '',
		},
		body: JSON.stringify(body),
	});
	const payload = await response.json() as { ocs: { data: { task: { id: number } } } };

	return payload.ocs.data.task.id;
}

describe('parity: core text processing (deprecated)', () => {
	beforeEach(() => {
		resetTextProcessingStore();
	});

	it('GET /ocs/v2.php/textprocessing/tasktypes is public (200 without auth)', async () => {
		const result = await runParityCase({
			name: 'text-processing-task-types-public',
			path: '/ocs/v2.php/textprocessing/tasktypes?format=json',
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.types[0].id',
					'ocs.data.types[0].name',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/textprocessing/tasktypes happy path with session', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'text-processing-task-types-happy',
			path: '/ocs/v2.php/textprocessing/tasktypes?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.types[0].id',
					'ocs.data.types[0].description',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/textprocessing/schedule requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'text-processing-schedule-unauth',
			path: '/ocs/v2.php/textprocessing/schedule?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					type: PARITY_FREE_PROMPT_TYPE,
					appId: PARITY_TEXT_PROCESSING_APP_ID,
					input: 'hello',
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/textprocessing/schedule rejects unknown task type (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'text-processing-schedule-unknown-type',
			path: '/ocs/v2.php/textprocessing/schedule?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					type: 'unknown:task-type',
					appId: PARITY_TEXT_PROCESSING_APP_ID,
					input: 'hello',
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.message',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/textprocessing/schedule happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'text-processing-schedule-happy',
			path: '/ocs/v2.php/textprocessing/schedule?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					type: PARITY_FREE_PROMPT_TYPE,
					appId: PARITY_TEXT_PROCESSING_APP_ID,
					input: 'parity prompt',
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.task.type',
					'ocs.data.task.status',
					'ocs.data.task.appId',
					'ocs.data.task.input',
				],
				unstableIdPaths: TEXT_PROCESSING_UNSTABLE_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/textprocessing/task/{id} returns 404 for unknown task (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'text-processing-get-task-not-found',
			path: '/ocs/v2.php/textprocessing/task/999999?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.message',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/textprocessing/task/{id} happy path', async () => {
		const jar = await loginParitySession();
		const body = {
			type: PARITY_FREE_PROMPT_TYPE,
			appId: PARITY_TEXT_PROCESSING_APP_ID,
			input: 'parity get task',
		};
		const taskId = await scheduleTextProcessingOnServer(jar, body);
		seedParityTextProcessingTask(buildSeedTextProcessingTask('admin', {
			id: taskId,
			type: body.type,
			appId: body.appId,
			input: body.input,
		}));

		const result = await runParityCase({
			name: 'text-processing-get-task-happy',
			path: `/ocs/v2.php/textprocessing/task/${taskId}?format=json`,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.task.id',
					'ocs.data.task.type',
					'ocs.data.task.input',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE /ocs/v2.php/textprocessing/task/{id} returns 404 for unknown task (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'text-processing-delete-task-not-found',
			path: '/ocs/v2.php/textprocessing/task/999999?format=json',
			options: {
				method: 'DELETE',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.message',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE /ocs/v2.php/textprocessing/task/{id} happy path', async () => {
		const jar = await loginParitySession();
		const body = {
			type: PARITY_FREE_PROMPT_TYPE,
			appId: PARITY_TEXT_PROCESSING_APP_ID,
			input: 'parity delete task',
		};
		const taskId = await scheduleTextProcessingOnServer(jar, body);
		seedParityTextProcessingTask(buildSeedTextProcessingTask('admin', {
			id: taskId,
			type: body.type,
			appId: body.appId,
			input: body.input,
		}));

		const result = await runParityCase({
			name: 'text-processing-delete-task-happy',
			path: `/ocs/v2.php/textprocessing/task/${taskId}?format=json`,
			options: {
				method: 'DELETE',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.task.id',
					'ocs.data.task.type',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/textprocessing/tasks/app/{appId} requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'text-processing-list-by-app-unauth',
			path: `/ocs/v2.php/textprocessing/tasks/app/${PARITY_TEXT_PROCESSING_APP_ID}?format=json`,
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/textprocessing/tasks/app/{appId} happy path', async () => {
		const jar = await loginParitySession();
		const body = {
			type: PARITY_FREE_PROMPT_TYPE,
			appId: PARITY_TEXT_PROCESSING_APP_ID,
			input: 'parity list by app',
		};
		const taskId = await scheduleTextProcessingOnServer(jar, body);
		seedParityTextProcessingTask(buildSeedTextProcessingTask('admin', {
			id: taskId,
			type: body.type,
			appId: body.appId,
			input: body.input,
		}));

		const result = await runParityCase({
			name: 'text-processing-list-by-app-happy',
			path: `/ocs/v2.php/textprocessing/tasks/app/${PARITY_TEXT_PROCESSING_APP_ID}?format=json`,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.tasks[0].appId',
					'ocs.data.tasks[0].type',
				],
				unstableIdPaths: ['ocs.data.tasks[0].id'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});

describe('parity: core text to image (deprecated)', () => {
	beforeEach(() => {
		resetTextToImageStore();
	});

	it('GET /ocs/v2.php/text2image/is_available requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'text-to-image-is-available-unauth',
			path: '/ocs/v2.php/text2image/is_available?format=json',
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/text2image/is_available happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'text-to-image-is-available-happy',
			path: '/ocs/v2.php/text2image/is_available?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.isAvailable',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/text2image/schedule requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'text-to-image-schedule-unauth',
			path: '/ocs/v2.php/text2image/schedule?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					appId: PARITY_TEXT_TO_IMAGE_APP_ID,
					input: 'hello',
					numberOfImages: 1,
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/text2image/schedule rejects too many images (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'text-to-image-schedule-too-many-images',
			path: '/ocs/v2.php/text2image/schedule?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					appId: PARITY_TEXT_TO_IMAGE_APP_ID,
					input: 'hello',
					numberOfImages: 13,
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.message',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/text2image/schedule happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'text-to-image-schedule-happy',
			path: '/ocs/v2.php/text2image/schedule?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					appId: PARITY_TEXT_TO_IMAGE_APP_ID,
					input: 'parity image prompt',
					numberOfImages: 1,
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.task.appId',
					'ocs.data.task.status',
					'ocs.data.task.numberOfImages',
					'ocs.data.task.input',
				],
				unstableIdPaths: TEXT_TO_IMAGE_UNSTABLE_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/text2image/task/{id} returns 404 for unknown task (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'text-to-image-get-task-not-found',
			path: '/ocs/v2.php/text2image/task/999999?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.message',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/text2image/task/{id} happy path', async () => {
		const jar = await loginParitySession();
		const body = {
			appId: PARITY_TEXT_TO_IMAGE_APP_ID,
			input: 'parity get image task',
			numberOfImages: 1,
		};
		const taskId = await scheduleTextToImageOnServer(jar, body);
		seedParityTextToImageTask(buildSeedTextToImageTask('admin', {
			id: taskId,
			appId: body.appId,
			input: body.input,
			numberOfImages: body.numberOfImages,
		}));

		const result = await runParityCase({
			name: 'text-to-image-get-task-happy',
			path: `/ocs/v2.php/text2image/task/${taskId}?format=json`,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.task.id',
					'ocs.data.task.numberOfImages',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE /ocs/v2.php/text2image/task/{id} happy path', async () => {
		const jar = await loginParitySession();
		const body = {
			appId: PARITY_TEXT_TO_IMAGE_APP_ID,
			input: 'parity delete image task',
			numberOfImages: 1,
		};
		const taskId = await scheduleTextToImageOnServer(jar, body);
		seedParityTextToImageTask(buildSeedTextToImageTask('admin', {
			id: taskId,
			appId: body.appId,
			input: body.input,
			numberOfImages: body.numberOfImages,
		}));

		const result = await runParityCase({
			name: 'text-to-image-delete-task-happy',
			path: `/ocs/v2.php/text2image/task/${taskId}?format=json`,
			options: {
				method: 'DELETE',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.task.id',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/text2image/tasks/app/{appId} happy path', async () => {
		const jar = await loginParitySession();
		const body = {
			appId: PARITY_TEXT_TO_IMAGE_APP_ID,
			input: 'parity list image tasks',
			numberOfImages: 1,
		};
		const taskId = await scheduleTextToImageOnServer(jar, body);
		seedParityTextToImageTask(buildSeedTextToImageTask('admin', {
			id: taskId,
			appId: body.appId,
			input: body.input,
			numberOfImages: body.numberOfImages,
		}));

		const result = await runParityCase({
			name: 'text-to-image-list-by-app-happy',
			path: `/ocs/v2.php/text2image/tasks/app/${PARITY_TEXT_TO_IMAGE_APP_ID}?format=json`,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.tasks[0].appId',
				],
				unstableIdPaths: ['ocs.data.tasks[0].id'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/text2image/task/{id}/image/{index} returns 404 for invalid index (validation)', async () => {
		const jar = await loginParitySession();
		const body = {
			appId: PARITY_TEXT_TO_IMAGE_APP_ID,
			input: 'image index out of range',
			numberOfImages: 1,
		};
		const taskId = await scheduleTextToImageOnServer(jar, body);
		seedParityTextToImageTask(buildSeedTextToImageTask('admin', {
			id: taskId,
			appId: body.appId,
			input: body.input,
			numberOfImages: body.numberOfImages,
		}), true);

		const result = await runParityCase({
			name: 'text-to-image-get-image-not-found',
			path: `/ocs/v2.php/text2image/task/${taskId}/image/1?format=json`,
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.message',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/text2image/task/{id}/image/{index} happy path', async () => {
		const jar = await loginParitySession();
		const body = {
			appId: PARITY_TEXT_TO_IMAGE_APP_ID,
			input: 'parity image bytes',
			numberOfImages: 1,
		};
		const taskId = await scheduleTextToImageOnServer(jar, body);
		seedParityTextToImageTask(buildSeedTextToImageTask('admin', {
			id: taskId,
			appId: body.appId,
			input: body.input,
			numberOfImages: body.numberOfImages,
		}), true);

		const path = `/ocs/v2.php/text2image/task/${taskId}/image/0`;
		const env = getParityEnv();
		const options = {
			headers: {
				...OCS_JSON_HEADERS,
				cookie: cookieJarToHeader(jar) ?? '',
			},
		};

		async function fetchLegacyBinaryResponse() {
			if (env.legacyUsesMock && hasLegacyMockFixture(path, 'GET')) {
				const snapshot = await fetchLegacyMockSnapshot(path, options);

				return new Response(snapshot.rawBody, {
					status: snapshot.status,
					headers: snapshot.headers,
				});
			}

			return fetch(`${env.legacyBaseUrl}${path}`, options);
		}

		const [legacyResponse, newResponse] = await Promise.all([
			fetchLegacyBinaryResponse(),
			fetch(`${env.newBaseUrl}${path}`, options),
		]);

		const [legacySnapshot, newSnapshot] = await Promise.all([
			snapshotBinaryResponse(legacyResponse),
			snapshotBinaryResponse(newResponse),
		]);

		const mismatches = compareBinarySnapshots(
			legacySnapshot,
			newSnapshot,
			['content-type'],
			Object.fromEntries(legacyResponse.headers.entries()),
			Object.fromEntries(newResponse.headers.entries()),
		);

		expect(mismatches, formatParityMismatches(mismatches)).toEqual([]);
	});
});
