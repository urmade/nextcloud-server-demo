import { describe, expect, it } from 'vitest';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { fetchLegacyMockSnapshot, hasLegacyMockFixture } from '../legacy-mock/adapter';
import { compareBinarySnapshots, snapshotBinaryResponse } from '../helpers/binary';
import { cookieJarToHeader } from '../helpers/cookies';
import {
	basicAuthHeader,
	loginParitySession,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
} from '../helpers/session';
import {
	PARITY_FILE_TASK_TYPE_ID,
	PARITY_TASK_APP_ID,
	PARITY_TEXT_TASK_TYPE_ID,
} from '@/src/server/task-processing/catalog';
import {
	buildSeedTask,
	resetTaskStore,
	seedParityTask,
} from '@/src/server/task-processing/store';

const TASK_UNSTABLE_PATHS = [
	'ocs.data.task.id',
	'ocs.data.task.lastUpdated',
	'ocs.data.task.scheduledAt',
	'ocs.data.task.completionExpectedAt',
	'ocs.data.task.startedAt',
	'ocs.data.task.endedAt',
];

async function scheduleTaskOnServer(
	jar: Record<string, string>,
	body: Record<string, unknown>,
): Promise<number> {
	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/ocs/v2.php/taskprocessing/schedule?format=json`, {
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

function seedMatchingTask(userId: string, taskId: number, body: Record<string, unknown>): void {
	seedParityTask(buildSeedTask(userId, {
		id: taskId,
		type: body.type as string,
		appId: body.appId as string,
		input: body.input as Record<string, string | number>,
		customId: (body.customId as string | undefined) ?? null,
	}));
}

describe('parity: core task processing (user session)', () => {
	it('GET /ocs/v2.php/taskprocessing/tasktypes requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'task-types-unauth',
			path: '/ocs/v2.php/taskprocessing/tasktypes?format=json',
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

	it('GET /ocs/v2.php/taskprocessing/tasktypes happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'task-types-happy',
			path: '/ocs/v2.php/taskprocessing/tasktypes?format=json',
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
					`ocs.data.types["${PARITY_TEXT_TASK_TYPE_ID}"].name`,
					`ocs.data.types["${PARITY_TEXT_TASK_TYPE_ID}"].inputShape.input.type`,
					`ocs.data.types["${PARITY_FILE_TASK_TYPE_ID}"].inputShape.file.type`,
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/taskprocessing/schedule requires auth (401)', async () => {
		const result = await runParityCase({
			name: 'schedule-unauth',
			path: '/ocs/v2.php/taskprocessing/schedule?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					type: PARITY_TEXT_TASK_TYPE_ID,
					appId: PARITY_TASK_APP_ID,
					input: { input: 'hello' },
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/taskprocessing/schedule rejects unknown task type (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'schedule-unknown-type',
			path: '/ocs/v2.php/taskprocessing/schedule?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					type: 'unknown:task-type',
					appId: PARITY_TASK_APP_ID,
					input: { input: 'hello' },
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

	it('POST /ocs/v2.php/taskprocessing/schedule happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'schedule-happy',
			path: '/ocs/v2.php/taskprocessing/schedule?format=json',
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					'content-type': 'application/json',
					cookie: cookieJarToHeader(jar) ?? '',
				},
				body: JSON.stringify({
					type: PARITY_TEXT_TASK_TYPE_ID,
					appId: PARITY_TASK_APP_ID,
					input: { input: 'parity prompt' },
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.task.type',
					'ocs.data.task.status',
					'ocs.data.task.appId',
					'ocs.data.task.input.input',
				],
				unstableIdPaths: TASK_UNSTABLE_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/taskprocessing/task/{id} returns 404 for unknown task (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'get-task-not-found',
			path: '/ocs/v2.php/taskprocessing/task/999999?format=json',
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

	it('GET /ocs/v2.php/taskprocessing/task/{id} happy path', async () => {
		const jar = await loginParitySession();
		const body = {
			type: PARITY_TEXT_TASK_TYPE_ID,
			appId: PARITY_TASK_APP_ID,
			input: { input: 'parity get task' },
		};
		const taskId = await scheduleTaskOnServer(jar, body);
		seedMatchingTask('admin', taskId, body);

		const result = await runParityCase({
			name: 'get-task-happy',
			path: `/ocs/v2.php/taskprocessing/task/${taskId}?format=json`,
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
					'ocs.data.task.status',
					'ocs.data.task.input.input',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/taskprocessing/tasks happy path', async () => {
		const jar = await loginParitySession();
		const body = {
			type: PARITY_TEXT_TASK_TYPE_ID,
			appId: PARITY_TASK_APP_ID,
			input: { input: 'parity list tasks' },
		};
		const taskId = await scheduleTaskOnServer(jar, body);
		seedMatchingTask('admin', taskId, body);

		const result = await runParityCase({
			name: 'list-tasks-happy',
			path: `/ocs/v2.php/taskprocessing/tasks?format=json&taskType=${PARITY_TEXT_TASK_TYPE_ID}`,
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
					'ocs.data.tasks[0].type',
					'ocs.data.tasks[0].status',
				],
				unstableIdPaths: ['ocs.data.tasks[0].id', 'ocs.data.tasks[0].lastUpdated'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/taskprocessing/tasks/app/{appId} happy path', async () => {
		const jar = await loginParitySession();
		const body = {
			type: PARITY_TEXT_TASK_TYPE_ID,
			appId: PARITY_TASK_APP_ID,
			input: { input: 'parity list by app' },
		};
		const taskId = await scheduleTaskOnServer(jar, body);
		seedMatchingTask('admin', taskId, body);

		const result = await runParityCase({
			name: 'list-tasks-by-app-happy',
			path: `/ocs/v2.php/taskprocessing/tasks/app/${PARITY_TASK_APP_ID}?format=json`,
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

	it('GET /ocs/v2.php/taskprocessing/queue_stats happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'queue-stats-happy',
			path: '/ocs/v2.php/taskprocessing/queue_stats?format=json',
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
					'ocs.data.scheduled_count',
					'ocs.data.running_count',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/taskprocessing/tasks/{taskId}/queue_position returns 404 for unknown task (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'queue-position-not-found',
			path: '/ocs/v2.php/taskprocessing/tasks/999999/queue_position?format=json',
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

	it('GET /ocs/v2.php/taskprocessing/tasks/{taskId}/queue_position happy path', async () => {
		const jar = await loginParitySession();
		const body = {
			type: PARITY_TEXT_TASK_TYPE_ID,
			appId: PARITY_TASK_APP_ID,
			input: { input: 'parity queue position' },
		};
		const taskId = await scheduleTaskOnServer(jar, body);
		seedMatchingTask('admin', taskId, body);

		const result = await runParityCase({
			name: 'queue-position-happy',
			path: `/ocs/v2.php/taskprocessing/tasks/${taskId}/queue_position?format=json`,
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
					'ocs.data',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/taskprocessing/tasks/{taskId}/cancel returns 404 for unknown task (validation)', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'cancel-task-not-found',
			path: '/ocs/v2.php/taskprocessing/tasks/999999/cancel?format=json',
			options: {
				method: 'POST',
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

	it('POST /ocs/v2.php/taskprocessing/tasks/{taskId}/cancel happy path', async () => {
		const jar = await loginParitySession();
		const body = {
			type: PARITY_TEXT_TASK_TYPE_ID,
			appId: PARITY_TASK_APP_ID,
			input: { input: 'parity cancel task' },
		};
		const taskId = await scheduleTaskOnServer(jar, body);
		seedMatchingTask('admin', taskId, body);

		const result = await runParityCase({
			name: 'cancel-task-happy',
			path: `/ocs/v2.php/taskprocessing/tasks/${taskId}/cancel?format=json`,
			options: {
				method: 'POST',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.task.status',
				],
				unstableIdPaths: ['ocs.data.task.endedAt', 'ocs.data.task.lastUpdated'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE /ocs/v2.php/taskprocessing/task/{id} happy path', async () => {
		const jar = await loginParitySession();

		const result = await runParityCase({
			name: 'delete-task-happy',
			path: '/ocs/v2.php/taskprocessing/task/999999?format=json',
			options: {
				method: 'DELETE',
				headers: {
					...OCS_JSON_HEADERS,
					cookie: cookieJarToHeader(jar) ?? '',
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/taskprocessing/tasks/{taskId}/file/{fileId} returns 404 when file not referenced (validation)', async () => {
		const jar = await loginParitySession();
		const body = {
			type: PARITY_TEXT_TASK_TYPE_ID,
			appId: PARITY_TASK_APP_ID,
			input: { input: 'no file here' },
		};
		const taskId = await scheduleTaskOnServer(jar, body);
		seedMatchingTask('admin', taskId, body);

		const result = await runParityCase({
			name: 'get-file-contents-not-found',
			path: `/ocs/v2.php/taskprocessing/tasks/${taskId}/file/100?format=json`,
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

	it('GET /ocs/v2.php/taskprocessing/tasks/{taskId}/file/{fileId} happy path', async () => {
		const jar = await loginParitySession();
		const body = {
			type: PARITY_FILE_TASK_TYPE_ID,
			appId: PARITY_TASK_APP_ID,
			input: { file: 100 },
		};
		const taskId = await scheduleTaskOnServer(jar, body);
		seedMatchingTask('admin', taskId, body);
		const path = `/ocs/v2.php/taskprocessing/tasks/${taskId}/file/100`;
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
			['content-type', 'content-disposition'],
			Object.fromEntries(legacyResponse.headers.entries()),
			Object.fromEntries(newResponse.headers.entries()),
		);

		expect(mismatches, formatParityMismatches(mismatches)).toEqual([]);
	});

	it('supports Basic auth for task types', async () => {
		resetTaskStore();

		const result = await runParityCase({
			name: 'task-types-basic-auth',
			path: '/ocs/v2.php/taskprocessing/tasktypes?format=json',
			options: {
				headers: {
					...OCS_JSON_HEADERS,
					...basicAuthHeader('admin', 'parity-test-password'),
				},
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					`ocs.data.types["${PARITY_TEXT_TASK_TYPE_ID}"].name`,
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});
});
