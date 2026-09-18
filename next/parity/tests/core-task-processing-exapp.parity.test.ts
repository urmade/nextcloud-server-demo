import { beforeEach, describe, expect, it } from 'vitest';
import { getParityEnv } from '../env';
import { formatParityMismatches, runParityCase } from '../harness';
import { resetParityTaskStores } from '../helpers/task-processing';
import { fetchLegacyMockSnapshot, hasLegacyMockFixture } from '../legacy-mock/adapter';
import { compareBinarySnapshots, snapshotBinaryResponse } from '../helpers/binary';
import {
	exAppAuthHeaders,
	loginParitySession,
	OCS_JSON_HEADERS,
	OCS_META_PATHS,
} from '../helpers/session';
import { cookieJarToHeader } from '../helpers/cookies';
import {
	PARITY_FILE_TASK_TYPE_ID,
	PARITY_TASK_APP_ID,
	PARITY_TEXT_PROVIDER_ID,
	PARITY_TEXT_TASK_TYPE_ID,
} from '@/src/server/task-processing/catalog';
import {
	buildSeedTask,
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

async function scheduleExAppTaskOnServer(body: Record<string, unknown>): Promise<number> {
	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/ocs/v2.php/taskprocessing/tasks_consumer/schedule?format=json`, {
		method: 'POST',
		headers: {
			...exAppAuthHeaders(),
			'content-type': 'application/json',
		},
		body: JSON.stringify(body),
	});
	const payload = await response.json() as { ocs: { data: { task: { id: number } } } };

	return payload.ocs.data.task.id;
}

function seedExAppTask(taskId: number, body: Record<string, unknown>): void {
	seedParityTask(buildSeedTask('', {
		id: taskId,
		userId: null,
		type: body.type as string,
		appId: body.appId as string,
		input: body.input as Record<string, string | number>,
		customId: (body.customId as string | undefined) ?? null,
	}));
}

describe('parity: core task processing (ex-app / worker)', () => {
	beforeEach(async () => {
		await resetParityTaskStores();
	});

	it('GET /ocs/v2.php/taskprocessing/tasks_consumer/tasktypes requires ExApp auth (412)', async () => {
		const result = await runParityCase({
			name: 'exapp-task-types-unauth',
			path: '/ocs/v2.php/taskprocessing/tasks_consumer/tasktypes?format=json',
			options: {
				headers: OCS_JSON_HEADERS,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/taskprocessing/tasks_consumer/tasktypes happy path', async () => {
		const result = await runParityCase({
			name: 'exapp-task-types-happy',
			path: '/ocs/v2.php/taskprocessing/tasks_consumer/tasktypes?format=json',
			options: {
				headers: exAppAuthHeaders(),
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

	it('POST /ocs/v2.php/taskprocessing/tasks_consumer/schedule requires ExApp auth (412)', async () => {
		const result = await runParityCase({
			name: 'exapp-schedule-unauth',
			path: '/ocs/v2.php/taskprocessing/tasks_consumer/schedule?format=json',
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
				includeBodyPaths: ['message'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/taskprocessing/tasks_consumer/schedule rejects unknown task type (validation)', async () => {
		const result = await runParityCase({
			name: 'exapp-schedule-unknown-type',
			path: '/ocs/v2.php/taskprocessing/tasks_consumer/schedule?format=json',
			options: {
				method: 'POST',
				headers: {
					...exAppAuthHeaders(),
					'content-type': 'application/json',
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

	it('POST /ocs/v2.php/taskprocessing/tasks_consumer/schedule rejects file input without user context (validation)', async () => {
		const result = await runParityCase({
			name: 'exapp-schedule-file-unauth',
			path: '/ocs/v2.php/taskprocessing/tasks_consumer/schedule?format=json',
			options: {
				method: 'POST',
				headers: {
					...exAppAuthHeaders(),
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					type: PARITY_FILE_TASK_TYPE_ID,
					appId: PARITY_TASK_APP_ID,
					input: { file: 100 },
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

	it('GET /ocs/v2.php/taskprocessing/tasks_provider/next returns 204 when queue empty (validation)', async () => {
		const result = await runParityCase({
			name: 'exapp-next-empty',
			path: '/ocs/v2.php/taskprocessing/tasks_provider/next?format=json&providerIds[]=unknown:provider&taskTypeIds[]=unknown:type',
			options: {
				headers: exAppAuthHeaders(),
			},
			compare: {
				contractHeaders: ['content-type'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/taskprocessing/tasks_consumer/schedule happy path', async () => {
		const result = await runParityCase({
			name: 'exapp-schedule-happy',
			path: '/ocs/v2.php/taskprocessing/tasks_consumer/schedule?format=json',
			options: {
				method: 'POST',
				headers: {
					...exAppAuthHeaders(),
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					type: PARITY_TEXT_TASK_TYPE_ID,
					appId: PARITY_TASK_APP_ID,
					input: { input: 'ex-app prompt' },
				}),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.task.type',
					'ocs.data.task.status',
					'ocs.data.task.appId',
				],
				unstableIdPaths: TASK_UNSTABLE_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/taskprocessing/tasks_consumer/task/{id} returns 404 for unknown task (validation)', async () => {
		const result = await runParityCase({
			name: 'exapp-get-task-not-found',
			path: '/ocs/v2.php/taskprocessing/tasks_consumer/task/999999?format=json',
			options: {
				headers: exAppAuthHeaders(),
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

	it('GET /ocs/v2.php/taskprocessing/tasks_consumer/task/{id} happy path', async () => {
		const body = {
			type: PARITY_TEXT_TASK_TYPE_ID,
			appId: PARITY_TASK_APP_ID,
			input: { input: 'ex-app get task' },
		};
		const taskId = await scheduleExAppTaskOnServer(body);
		seedExAppTask(taskId, body);

		const result = await runParityCase({
			name: 'exapp-get-task-happy',
			path: `/ocs/v2.php/taskprocessing/tasks_consumer/task/${taskId}?format=json`,
			options: {
				headers: exAppAuthHeaders(),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.task.id',
					'ocs.data.task.type',
					'ocs.data.task.status',
				],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('DELETE /ocs/v2.php/taskprocessing/tasks_consumer/task/{id} happy path', async () => {
		const result = await runParityCase({
			name: 'exapp-delete-task-happy',
			path: '/ocs/v2.php/taskprocessing/tasks_consumer/task/999999?format=json',
			options: {
				method: 'DELETE',
				headers: exAppAuthHeaders(),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: OCS_META_PATHS,
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/taskprocessing/tasks_consumer/tasks/{taskId}/cancel returns 404 for unknown task (validation)', async () => {
		const result = await runParityCase({
			name: 'exapp-cancel-not-found',
			path: '/ocs/v2.php/taskprocessing/tasks_consumer/tasks/999999/cancel?format=json',
			options: {
				method: 'POST',
				headers: exAppAuthHeaders(),
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

	it('POST /ocs/v2.php/taskprocessing/tasks_consumer/tasks/{taskId}/cancel happy path', async () => {
		const body = {
			type: PARITY_TEXT_TASK_TYPE_ID,
			appId: PARITY_TASK_APP_ID,
			input: { input: 'ex-app cancel' },
		};
		const taskId = await scheduleExAppTaskOnServer(body);
		seedExAppTask(taskId, body);

		const result = await runParityCase({
			name: 'exapp-cancel-happy',
			path: `/ocs/v2.php/taskprocessing/tasks_consumer/tasks/${taskId}/cancel?format=json`,
			options: {
				method: 'POST',
				headers: exAppAuthHeaders(),
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

	it('GET /ocs/v2.php/taskprocessing/tasks_provider/next happy path', async () => {
		const body = {
			type: PARITY_TEXT_TASK_TYPE_ID,
			appId: PARITY_TASK_APP_ID,
			input: { input: 'claim me' },
		};
		const taskId = await scheduleExAppTaskOnServer(body);
		seedExAppTask(taskId, body);

		const result = await runParityCase({
			name: 'exapp-next-happy',
			path: `/ocs/v2.php/taskprocessing/tasks_provider/next?format=json&providerIds[]=${PARITY_TEXT_PROVIDER_ID}&taskTypeIds[]=${PARITY_TEXT_TASK_TYPE_ID}`,
			options: {
				headers: exAppAuthHeaders(),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.task.status',
					'ocs.data.provider.name',
				],
				unstableIdPaths: ['ocs.data.task.id', 'ocs.data.task.startedAt', 'ocs.data.task.lastUpdated'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/taskprocessing/tasks_provider/next_batch happy path', async () => {
		const body = {
			type: PARITY_TEXT_TASK_TYPE_ID,
			appId: PARITY_TASK_APP_ID,
			input: { input: 'batch claim' },
		};
		const taskId = await scheduleExAppTaskOnServer(body);
		seedExAppTask(taskId, body);

		const result = await runParityCase({
			name: 'exapp-next-batch-happy',
			path: `/ocs/v2.php/taskprocessing/tasks_provider/next_batch?format=json&providerIds[]=${PARITY_TEXT_PROVIDER_ID}&taskTypeIds[]=${PARITY_TEXT_TASK_TYPE_ID}&numberOfTasks=1`,
			options: {
				headers: exAppAuthHeaders(),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.tasks[0].provider',
					'ocs.data.has_more',
				],
				unstableIdPaths: ['ocs.data.tasks[0].task.id'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/taskprocessing/tasks_provider/{taskId}/progress returns 404 for unknown task (validation)', async () => {
		const result = await runParityCase({
			name: 'exapp-set-progress-not-found',
			path: '/ocs/v2.php/taskprocessing/tasks_provider/999999/progress?format=json',
			options: {
				method: 'POST',
				headers: {
					...exAppAuthHeaders(),
					'content-type': 'application/json',
				},
				body: JSON.stringify({ progress: 0.5 }),
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

	it('POST /ocs/v2.php/taskprocessing/tasks_provider/{taskId}/progress happy path', async () => {
		const body = {
			type: PARITY_TEXT_TASK_TYPE_ID,
			appId: PARITY_TASK_APP_ID,
			input: { input: 'progress task' },
		};
		const taskId = await scheduleExAppTaskOnServer(body);
		seedExAppTask(taskId, body);

		const result = await runParityCase({
			name: 'exapp-set-progress-happy',
			path: `/ocs/v2.php/taskprocessing/tasks_provider/${taskId}/progress?format=json`,
			options: {
				method: 'POST',
				headers: {
					...exAppAuthHeaders(),
					'content-type': 'application/json',
				},
				body: JSON.stringify({ progress: 0.5 }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.task.status',
					'ocs.data.task.progress',
				],
				unstableIdPaths: ['ocs.data.task.startedAt', 'ocs.data.task.lastUpdated'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/taskprocessing/tasks_provider/{taskId}/result happy path', async () => {
		const body = {
			type: PARITY_TEXT_TASK_TYPE_ID,
			appId: PARITY_TASK_APP_ID,
			input: { input: 'result task' },
		};
		const taskId = await scheduleExAppTaskOnServer(body);
		seedExAppTask(taskId, body);

		const result = await runParityCase({
			name: 'exapp-set-result-happy',
			path: `/ocs/v2.php/taskprocessing/tasks_provider/${taskId}/result?format=json`,
			options: {
				method: 'POST',
				headers: {
					...exAppAuthHeaders(),
					'content-type': 'application/json',
				},
				body: JSON.stringify({ output: { output: 'done' } }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.task.status',
					'ocs.data.task.output.output',
				],
				unstableIdPaths: ['ocs.data.task.endedAt', 'ocs.data.task.lastUpdated'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/taskprocessing/tasks_provider/{taskId}/stream-result happy path', async () => {
		const body = {
			type: PARITY_TEXT_TASK_TYPE_ID,
			appId: PARITY_TASK_APP_ID,
			input: { input: 'stream task' },
		};
		const taskId = await scheduleExAppTaskOnServer(body);
		seedExAppTask(taskId, body);

		const env = getParityEnv();
		await fetch(`${env.newBaseUrl}/ocs/v2.php/taskprocessing/tasks_provider/${taskId}/progress?format=json`, {
			method: 'POST',
			headers: {
				...exAppAuthHeaders(),
				'content-type': 'application/json',
			},
			body: JSON.stringify({ progress: 0.25 }),
		});
		seedParityTask(buildSeedTask('', {
			id: taskId,
			userId: null,
			type: body.type,
			appId: body.appId,
			input: body.input,
			status: 'STATUS_RUNNING',
			startedAt: Math.floor(Date.now() / 1000),
		}));

		const result = await runParityCase({
			name: 'exapp-set-intermediate-happy',
			path: `/ocs/v2.php/taskprocessing/tasks_provider/${taskId}/stream-result?format=json`,
			options: {
				method: 'POST',
				headers: {
					...exAppAuthHeaders(),
					'content-type': 'application/json',
				},
				body: JSON.stringify({ output: { output: 'partial' } }),
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					...OCS_META_PATHS,
					'ocs.data.task.output.output',
				],
				unstableIdPaths: ['ocs.data.task.lastUpdated'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('POST /ocs/v2.php/taskprocessing/tasks_provider/{taskId}/file returns 404 for unknown task (validation)', async () => {
		const form = new FormData();
		form.append('file', new Blob(['hello'], { type: 'text/plain' }), 'hello.txt');

		const result = await runParityCase({
			name: 'exapp-set-file-not-found',
			path: '/ocs/v2.php/taskprocessing/tasks_provider/999999/file?format=json',
			options: {
				method: 'POST',
				headers: exAppAuthHeaders(),
				body: form,
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

	it('POST /ocs/v2.php/taskprocessing/tasks_provider/{taskId}/file happy path', async () => {
		const body = {
			type: PARITY_TEXT_TASK_TYPE_ID,
			appId: PARITY_TASK_APP_ID,
			input: { input: 'upload task' },
		};
		const taskId = await scheduleExAppTaskOnServer(body);
		seedExAppTask(taskId, body);
		const form = new FormData();
		form.append('file', new Blob(['parity'], { type: 'text/plain' }), 'parity.txt');

		const result = await runParityCase({
			name: 'exapp-set-file-happy',
			path: `/ocs/v2.php/taskprocessing/tasks_provider/${taskId}/file?format=json`,
			options: {
				method: 'POST',
				headers: exAppAuthHeaders(),
				body: form,
			},
			compare: {
				contractHeaders: ['content-type'],
				includeBodyPaths: [
					'ocs.meta.status',
					'ocs.meta.statuscode',
					'ocs.data.fileId',
				],
				unstableIdPaths: ['ocs.data.fileId'],
			},
		});

		expect(result.mismatches, formatParityMismatches(result.mismatches)).toEqual([]);
	});

	it('GET /ocs/v2.php/taskprocessing/tasks_provider/{taskId}/file/{fileId} happy path', async () => {
		const jar = await loginParitySession();
		const env = getParityEnv();
		const scheduleResponse = await fetch(`${env.newBaseUrl}/ocs/v2.php/taskprocessing/schedule?format=json`, {
			method: 'POST',
			headers: {
				...OCS_JSON_HEADERS,
				'content-type': 'application/json',
				cookie: cookieJarToHeader(jar) ?? '',
			},
			body: JSON.stringify({
				type: PARITY_FILE_TASK_TYPE_ID,
				appId: PARITY_TASK_APP_ID,
				input: { file: 100 },
			}),
		});
		const schedulePayload = await scheduleResponse.json() as { ocs: { data: { task: { id: number } } } };
		const taskId = schedulePayload.ocs.data.task.id;
		seedParityTask(buildSeedTask('admin', {
			id: taskId,
			type: PARITY_FILE_TASK_TYPE_ID,
			appId: PARITY_TASK_APP_ID,
			input: { file: 100 },
		}));

		const path = `/ocs/v2.php/taskprocessing/tasks_provider/${taskId}/file/100`;
		const options = { headers: exAppAuthHeaders() };

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
});
