import {
	getTaskType,
	intersectTaskTypesAndProviders,
	isFileShapeType,
	PARITY_TEXT_TASK_TYPE_ID,
} from '@/src/server/task-processing/catalog';
import type {
	ScheduleTaskRequest,
	TaskProcessingIo,
	TaskProcessingTask,
} from '@/src/server/task-processing/types';

const tasks = new Map<number, TaskProcessingTask>();
const uploadedFiles = new Map<number, { bytes: Uint8Array; mime: string; name: string }>();
let nextTaskId = 1;
let nextUploadedFileId = 1000;

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

function validateInputForUserContext(taskTypeId: string, input: TaskProcessingIo, userId: string | null): string | null {
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

		if (isFileShapeType(descriptor.type)) {
			if (userId === null) {
				return 'Cannot schedule task with files referenced without user context';
			}

			if (typeof input[key] !== 'number') {
				return `Failed to validate input key "${key}": Expected file id`;
			}
		}
	}

	return null;
}

export function resetTaskStore(): void {
	tasks.clear();
	uploadedFiles.clear();
	nextTaskId = 1;
	nextUploadedFileId = 1000;
}

export function seedParityTask(task: TaskProcessingTask): void {
	tasks.set(task.id, structuredClone(task));

	if (task.id >= nextTaskId) {
		nextTaskId = task.id + 1;
	}
}

export function scheduleTask(userId: string, request: ScheduleTaskRequest): TaskProcessingTask {
	return scheduleTaskInternal(userId, request);
}

export function scheduleExAppTask(request: ScheduleTaskRequest): TaskProcessingTask {
	return scheduleTaskInternal(null, request);
}

function scheduleTaskInternal(userId: string | null, request: ScheduleTaskRequest): TaskProcessingTask {
	const taskType = getTaskType(request.type);

	if (!taskType) {
		throw new PreConditionNotMetError('The given provider is not available');
	}

	const webhookError = validateWebhook(request.webhookUri, request.webhookMethod);

	if (webhookError) {
		throw new ValidationError(webhookError);
	}

	const inputError = validateInputForUserContext(request.type, request.input, userId);

	if (inputError) {
		if (inputError === 'Cannot schedule task with files referenced without user context') {
			throw new UnauthorizedError(inputError);
		}

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

export function getUserTask(taskId: number, userId: string | null): TaskProcessingTask {
	const task = tasks.get(taskId);

	if (!task || task.userId !== userId) {
		throw new NotFoundError('Task not found');
	}

	return serializeTask(task);
}

export function getTaskById(taskId: number): TaskProcessingTask {
	const task = tasks.get(taskId);

	if (!task) {
		throw new NotFoundError('Not found');
	}

	return serializeTask(task);
}

export function deleteTaskById(taskId: number): void {
	if (!tasks.has(taskId)) {
		return;
	}

	tasks.delete(taskId);
}

export function cancelTaskById(taskId: number): TaskProcessingTask {
	const task = tasks.get(taskId);

	if (!task) {
		throw new NotFoundError('Not found');
	}

	task.status = 'STATUS_CANCELLED';
	task.lastUpdated = nowSeconds();
	task.endedAt = task.lastUpdated;

	return serializeTask(task);
}

export function claimNextScheduledTask(taskTypeIds: string[]): TaskProcessingTask | null {
	const eligible = [...tasks.values()]
		.filter((task) => task.status === 'STATUS_SCHEDULED')
		.filter((task) => taskTypeIds.length === 0 || taskTypeIds.includes(task.type))
		.sort((left, right) => (left.scheduledAt ?? 0) - (right.scheduledAt ?? 0));

	const task = eligible[0];

	if (!task) {
		return null;
	}

	task.status = 'STATUS_RUNNING';
	task.startedAt = nowSeconds();
	task.lastUpdated = task.startedAt;

	return serializeTask(task);
}

export function hasMoreScheduledTasks(taskTypeIds: string[]): boolean {
	return [...tasks.values()].some((task) => {
		return task.status === 'STATUS_SCHEDULED'
			&& (taskTypeIds.length === 0 || taskTypeIds.includes(task.type));
	});
}

export function claimNextScheduledTaskBatch(
	providerIds: string[],
	taskTypeIds: string[],
	numberOfTasks: number,
): { tasks: Array<{ task: TaskProcessingTask; provider: string }>; hasMore: boolean } {
	const { providerIds: possibleProviderIds, taskTypeIds: possibleTaskTypeIds } = intersectTaskTypesAndProviders(
		taskTypeIds,
		providerIds,
	);

	if (possibleProviderIds.length === 0 || possibleTaskTypeIds.length === 0) {
		return { tasks: [], hasMore: false };
	}

	const claimed: Array<{ task: TaskProcessingTask; provider: string }> = [];

	while (claimed.length < numberOfTasks) {
		const task = claimNextScheduledTask(possibleTaskTypeIds);

		if (!task) {
			break;
		}

		claimed.push({ task, provider: task.type });
	}

	const hasMore = hasMoreScheduledTasks(possibleTaskTypeIds);

	return { tasks: claimed, hasMore };
}

export function setTaskProgress(taskId: number, progress: number): TaskProcessingTask {
	const task = tasks.get(taskId);

	if (!task) {
		throw new NotFoundError('Not found');
	}

	if (task.status === 'STATUS_CANCELLED') {
		return serializeTask(task);
	}

	if (task.status === 'STATUS_SCHEDULED') {
		task.startedAt = nowSeconds();
	}

	task.status = 'STATUS_RUNNING';

	if (progress >= 0 && progress <= 1.0) {
		task.progress = progress;
	}

	task.lastUpdated = nowSeconds();

	return serializeTask(task);
}

export function setTaskResult(
	taskId: number,
	output: TaskProcessingIo | null,
	errorMessage: string | null,
	userFacingErrorMessage: string | null,
): TaskProcessingTask {
	const task = tasks.get(taskId);

	if (!task) {
		throw new NotFoundError('Not found');
	}

	if (task.status === 'STATUS_CANCELLED') {
		return serializeTask(task);
	}

	if (errorMessage !== null) {
		task.status = 'STATUS_FAILED';
		task.output = null;
		task.userFacingErrorMessage = userFacingErrorMessage;
	} else {
		task.status = 'STATUS_SUCCESSFUL';
		task.output = output ? structuredClone(output) : null;
		task.userFacingErrorMessage = null;
	}

	task.endedAt = nowSeconds();
	task.lastUpdated = task.endedAt;

	return serializeTask(task);
}

export function setTaskIntermediateOutput(taskId: number, output: TaskProcessingIo): TaskProcessingTask {
	const task = tasks.get(taskId);

	if (!task) {
		throw new NotFoundError('Not found');
	}

	if (task.status !== 'STATUS_RUNNING') {
		return serializeTask(task);
	}

	task.output = structuredClone(output);
	task.lastUpdated = nowSeconds();

	return serializeTask(task);
}

export function uploadTaskFile(bytes: Uint8Array, filename: string, mime = 'application/octet-stream'): number {
	const fileId = nextUploadedFileId;
	nextUploadedFileId += 1;
	uploadedFiles.set(fileId, { bytes, mime, name: filename });

	return fileId;
}

export function getUploadedFile(fileId: number): { bytes: Uint8Array; mime: string; name: string } | null {
	return uploadedFiles.get(fileId) ?? null;
}

export function getTaskFileById(task: TaskProcessingTask, fileId: number): { bytes: Uint8Array; mime: string; name: string } | null {
	const referencedIds = extractFileIdsFromTask(task);

	if (!referencedIds.includes(fileId)) {
		return null;
	}

	return getUploadedFile(fileId);
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
		userId: overrides.userId !== undefined ? overrides.userId : userId,
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

export class UnauthorizedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UnauthorizedError';
	}
}
