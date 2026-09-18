import {
	isKnownTextProcessingTaskType,
	isTextProcessingProviderAvailable,
} from '@/src/server/text-processing/catalog';
import type {
	ScheduleTextProcessingRequest,
	TextProcessingTask,
} from '@/src/server/text-processing/types';

const tasks = new Map<number, TextProcessingTask>();
let nextTaskId = 1;

function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

function serializeTask(task: TextProcessingTask): TextProcessingTask {
	return structuredClone(task);
}

export function resetTextProcessingStore(): void {
	tasks.clear();
	nextTaskId = 1;
}

export function seedParityTextProcessingTask(task: TextProcessingTask): void {
	tasks.set(task.id as number, structuredClone(task));

	if ((task.id ?? 0) >= nextTaskId) {
		nextTaskId = (task.id as number) + 1;
	}
}

export function scheduleTextProcessingTask(
	userId: string,
	request: ScheduleTextProcessingRequest,
): TextProcessingTask {
	if (request.input.length > 64_000) {
		throw new ValidationError('Input text is too long');
	}

	if (!isKnownTextProcessingTaskType(request.type)) {
		throw new ValidationError('Requested task type does not exist');
	}

	if (!isTextProcessingProviderAvailable()) {
		throw new PreConditionNotMetError('Necessary language model provider is not available');
	}

	const timestamp = nowSeconds();
	const task: TextProcessingTask = {
		id: nextTaskId,
		type: request.type,
		status: 1,
		userId,
		appId: request.appId,
		input: request.input,
		output: null,
		identifier: request.identifier ?? '',
		completionExpectedAt: timestamp + 60,
	};

	nextTaskId += 1;
	tasks.set(task.id as number, task);

	return serializeTask(task);
}

export function getTextProcessingUserTask(taskId: number, userId: string): TextProcessingTask {
	const task = tasks.get(taskId);

	if (!task || task.userId !== userId) {
		throw new NotFoundError('Task not found');
	}

	return serializeTask(task);
}

export function deleteTextProcessingUserTask(taskId: number, userId: string): TextProcessingTask {
	const task = tasks.get(taskId);

	if (!task || task.userId !== userId) {
		throw new NotFoundError('Task not found');
	}

	tasks.delete(taskId);

	return serializeTask(task);
}

export function listTextProcessingTasksByApp(
	userId: string,
	appId: string,
	identifier?: string | null,
): TextProcessingTask[] {
	return [...tasks.values()]
		.filter((task) => task.userId === userId && task.appId === appId)
		.filter((task) => !identifier || task.identifier === identifier)
		.map(serializeTask);
}

export function buildSeedTextProcessingTask(
	userId: string,
	overrides: Partial<TextProcessingTask> & Pick<TextProcessingTask, 'id' | 'input' | 'type' | 'appId'>,
): TextProcessingTask {
	const timestamp = nowSeconds();

	return {
		id: overrides.id,
		type: overrides.type,
		status: overrides.status ?? 1,
		userId: overrides.userId !== undefined ? overrides.userId : userId,
		appId: overrides.appId,
		input: overrides.input,
		output: overrides.output ?? null,
		identifier: overrides.identifier ?? '',
		completionExpectedAt: overrides.completionExpectedAt ?? timestamp + 60,
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
