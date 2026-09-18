import {
	getTaskType,
	isFileShapeType,
	PARITY_TEXT_TASK_TYPE_ID,
} from '@/src/server/task-processing/catalog';
import type {
	ScheduleTaskRequest,
	TaskProcessingIo,
	TaskProcessingTask,
} from '@/src/server/task-processing/types';

const tasks = new Map<number, TaskProcessingTask>();
let nextTaskId = 1;

function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

function serializeTask(task: TaskProcessingTask): TaskProcessingTask {
	return structuredClone(task);
}

function validateWebhook(uri: string | null | undefined, method: string | null | undefined): string | null {
	if (!uri && !method) {
		return null;
	}

	if (method && !uri) {
		return 'Webhook URI is required when a webhook method is set';
	}

	if (uri && !method) {
		return 'Webhook method is required when a webhook URI is set';
	}

	if ((uri?.length ?? 0) > 4000) {
		return 'Webhook URI is too long, maximum length is 4000 characters';
	}

	if ((method?.length ?? 0) > 64) {
		return 'Webhook method is too long, maximum length is 64 characters';
	}

	return null;
}

function validateInput(taskTypeId: string, input: TaskProcessingIo): string | null {
	const taskType = getTaskType(taskTypeId);

	if (!taskType) {
		return null;
	}

	for (const [key, descriptor] of Object.entries(taskType.inputShape)) {
		if (!(key in input)) {
			return `Missing key: "${key}"`;
		}

		if (descriptor.type === 'Text' && typeof input[key] !== 'string') {
			return `Failed to validate input key "${key}": Expected text value`;
		}

		if (isFileShapeType(descriptor.type) && typeof input[key] !== 'number') {
			return `Failed to validate input key "${key}": Expected file id`;
		}
	}

	return null;
}

export function resetTaskStore(): void {
	tasks.clear();
	nextTaskId = 1;
}

export function seedParityTask(task: TaskProcessingTask): void {
	tasks.set(task.id, structuredClone(task));

	if (task.id >= nextTaskId) {
		nextTaskId = task.id + 1;
	}
}

export function scheduleTask(userId: string, request: ScheduleTaskRequest): TaskProcessingTask {
	const taskType = getTaskType(request.type);

	if (!taskType) {
		throw new PreConditionNotMetError('The given provider is not available');
	}

	const webhookError = validateWebhook(request.webhookUri, request.webhookMethod);

	if (webhookError) {
		throw new ValidationError(webhookError);
	}

	const inputError = validateInput(request.type, request.input);

	if (inputError) {
		throw new ValidationError(inputError);
	}

	const timestamp = nowSeconds();
	const task: TaskProcessingTask = {
		id: nextTaskId,
		lastUpdated: timestamp,
		type: request.type,
		status: 'STATUS_SCHEDULED',
		userId,
		appId: request.appId,
		input: structuredClone(request.input),
		output: null,
		customId: request.customId ?? null,
		completionExpectedAt: null,
		progress: null,
		scheduledAt: timestamp,
		startedAt: null,
		endedAt: null,
		allowCleanup: true,
		includeWatermark: request.includeWatermark ?? true,
		userFacingErrorMessage: null,
		preferStreaming: request.preferStreaming ?? false,
	};

	nextTaskId += 1;
	tasks.set(task.id, task);

	return serializeTask(task);
}

export function getUserTask(taskId: number, userId: string): TaskProcessingTask {
	const task = tasks.get(taskId);

	if (!task || task.userId !== userId) {
		throw new NotFoundError('Task not found');
	}

	return serializeTask(task);
}

export function deleteUserTask(taskId: number, userId: string): void {
	const task = tasks.get(taskId);

	if (!task || task.userId !== userId) {
		return;
	}

	tasks.delete(taskId);
}

export function listUserTasks(
	userId: string,
	taskType?: string | null,
	customId?: string | null,
): TaskProcessingTask[] {
	return [...tasks.values()]
		.filter((task) => task.userId === userId)
		.filter((task) => !taskType || task.type === taskType)
		.filter((task) => !customId || task.customId === customId)
		.map(serializeTask);
}

export function listUserTasksByApp(
	userId: string,
	appId: string,
	customId?: string | null,
): TaskProcessingTask[] {
	return [...tasks.values()]
		.filter((task) => task.userId === userId && task.appId === appId)
		.filter((task) => !customId || task.customId === customId)
		.map(serializeTask);
}

export function cancelUserTask(taskId: number, userId: string): TaskProcessingTask {
	const task = tasks.get(taskId);

	if (!task || task.userId !== userId) {
		throw new NotFoundError('Not found');
	}

	task.status = 'STATUS_CANCELLED';
	task.lastUpdated = nowSeconds();
	task.endedAt = task.lastUpdated;

	return serializeTask(task);
}

export function countTasks(status: TaskProcessingTask['status'], taskTypeIds: string[] = []): number {
	return [...tasks.values()].filter((task) => {
		if (task.status !== status) {
			return false;
		}

		if (taskTypeIds.length > 0 && !taskTypeIds.includes(task.type)) {
			return false;
		}

		return true;
	}).length;
}

export function getTaskQueuePosition(taskId: number, userId: string): number {
	const task = tasks.get(taskId);

	if (!task || task.userId !== userId) {
		throw new NotFoundError('Task not found');
	}

	if (task.status !== 'STATUS_SCHEDULED') {
		throw new PreConditionNotMetError('This task is not scheduled');
	}

	const scheduledBefore = [...tasks.values()].filter((candidate) => {
		return candidate.status === 'STATUS_SCHEDULED'
			&& (candidate.scheduledAt ?? 0) < (task.scheduledAt ?? 0);
	});

	return scheduledBefore.length;
}

export function extractFileIdsFromTask(task: TaskProcessingTask): number[] {
	const taskType = getTaskType(task.type);

	if (!taskType) {
		throw new NotFoundError('Could not find task type');
	}

	const ids: number[] = [];

	for (const [key, descriptor] of Object.entries({
		...taskType.inputShape,
		...taskType.optionalInputShape,
	})) {
		if (!isFileShapeType(descriptor.type)) {
			continue;
		}

		const value = task.input[key];

		if (typeof value === 'number') {
			ids.push(value);
		} else if (Array.isArray(value)) {
			ids.push(...value.filter((entry): entry is number => typeof entry === 'number'));
		}
	}

	if (task.output) {
		for (const [key, descriptor] of Object.entries({
			...taskType.outputShape,
			...taskType.optionalOutputShape,
		})) {
			if (!isFileShapeType(descriptor.type)) {
				continue;
			}

			const value = task.output[key];

			if (typeof value === 'number') {
				ids.push(value);
			} else if (Array.isArray(value)) {
				ids.push(...value.filter((entry): entry is number => typeof entry === 'number'));
			}
		}
	}

	return ids;
}

export function buildSeedTask(
	userId: string,
	overrides: Partial<TaskProcessingTask> & Pick<TaskProcessingTask, 'id' | 'input'>,
): TaskProcessingTask {
	const timestamp = nowSeconds();

	return {
		id: overrides.id,
		lastUpdated: overrides.lastUpdated ?? timestamp,
		type: overrides.type ?? PARITY_TEXT_TASK_TYPE_ID,
		status: overrides.status ?? 'STATUS_SCHEDULED',
		userId,
		appId: overrides.appId ?? 'core',
		input: overrides.input,
		output: overrides.output ?? null,
		customId: overrides.customId ?? null,
		completionExpectedAt: overrides.completionExpectedAt ?? null,
		progress: overrides.progress ?? null,
		scheduledAt: overrides.scheduledAt ?? timestamp,
		startedAt: overrides.startedAt ?? null,
		endedAt: overrides.endedAt ?? null,
		allowCleanup: overrides.allowCleanup ?? true,
		includeWatermark: overrides.includeWatermark ?? true,
		userFacingErrorMessage: overrides.userFacingErrorMessage ?? null,
		preferStreaming: overrides.preferStreaming ?? false,
	};
}

export class NotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'NotFoundError';
	}
}

export class PreConditionNotMetError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PreConditionNotMetError';
	}
}

export class ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ValidationError';
	}
}
