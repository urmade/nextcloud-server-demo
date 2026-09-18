import { getTextToImageFixture } from '@/src/server/fixtures/binary';
import { isTextToImageProviderAvailable } from '@/src/server/text-to-image/catalog';
import type {
	ScheduleTextToImageRequest,
	TextToImageTask,
} from '@/src/server/text-to-image/types';

const tasks = new Map<number, TextToImageTask>();
const images = new Map<string, Uint8Array>();
let nextTaskId = 1;

function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

function imageKey(taskId: number, index: number): string {
	return `${taskId}:${index}`;
}

function serializeTask(task: TextToImageTask): TextToImageTask {
	return structuredClone(task);
}

export function resetTextToImageStore(): void {
	tasks.clear();
	images.clear();
	nextTaskId = 1;
}

export function seedParityTextToImageTask(task: TextToImageTask, withImages = false): void {
	tasks.set(task.id as number, structuredClone(task));

	if (withImages) {
		const bytes = getTextToImageFixture();

		for (let index = 0; index < task.numberOfImages; index += 1) {
			images.set(imageKey(task.id as number, index), bytes);
		}
	}

	if ((task.id ?? 0) >= nextTaskId) {
		nextTaskId = (task.id as number) + 1;
	}
}

export function scheduleTextToImageTask(
	userId: string,
	request: ScheduleTextToImageRequest,
): TextToImageTask {
	const numberOfImages = request.numberOfImages ?? 8;

	if (request.input.length > 64_000) {
		throw new PreConditionNotMetError('Input text is too long');
	}

	if (numberOfImages > 12) {
		throw new PreConditionNotMetError('Cannot generate more than 12 images');
	}

	if (numberOfImages < 1) {
		throw new PreConditionNotMetError('Cannot generate less than 1 image');
	}

	if (!isTextToImageProviderAvailable()) {
		throw new PreConditionNotMetError('No text to image provider is available');
	}

	const timestamp = nowSeconds();
	const task: TextToImageTask = {
		id: nextTaskId,
		status: 1,
		userId,
		appId: request.appId,
		input: request.input,
		identifier: request.identifier ?? '',
		numberOfImages,
		completionExpectedAt: timestamp + 120,
	};

	nextTaskId += 1;
	tasks.set(task.id as number, task);

	const bytes = getTextToImageFixture();

	for (let index = 0; index < numberOfImages; index += 1) {
		images.set(imageKey(task.id as number, index), bytes);
	}

	return serializeTask(task);
}

export function getTextToImageUserTask(taskId: number, userId: string): TextToImageTask {
	const task = tasks.get(taskId);

	if (!task || task.userId !== userId) {
		throw new NotFoundError('Task not found');
	}

	return serializeTask(task);
}

export function deleteTextToImageUserTask(taskId: number, userId: string): TextToImageTask {
	const task = tasks.get(taskId);

	if (!task || task.userId !== userId) {
		throw new NotFoundError('Task not found');
	}

	tasks.delete(taskId);

	for (let index = 0; index < task.numberOfImages; index += 1) {
		images.delete(imageKey(taskId, index));
	}

	return serializeTask(task);
}

export function listTextToImageTasksByApp(
	userId: string,
	appId: string,
	identifier?: string | null,
): TextToImageTask[] {
	return [...tasks.values()]
		.filter((task) => task.userId === userId && task.appId === appId)
		.filter((task) => !identifier || task.identifier === identifier)
		.map(serializeTask);
}

export function getTextToImageBytes(taskId: number, userId: string, index: number): Uint8Array {
	const task = tasks.get(taskId);

	if (!task || task.userId !== userId) {
		throw new NotFoundError('Task not found');
	}

	const bytes = images.get(imageKey(taskId, index));

	if (!bytes) {
		throw new ImageNotFoundError('Image not found');
	}

	return bytes;
}

export function buildSeedTextToImageTask(
	userId: string,
	overrides: Partial<TextToImageTask> & Pick<TextToImageTask, 'id' | 'input' | 'appId' | 'numberOfImages'>,
): TextToImageTask {
	const timestamp = nowSeconds();

	return {
		id: overrides.id,
		status: overrides.status ?? 1,
		userId: overrides.userId !== undefined ? overrides.userId : userId,
		appId: overrides.appId,
		input: overrides.input,
		identifier: overrides.identifier ?? '',
		numberOfImages: overrides.numberOfImages,
		completionExpectedAt: overrides.completionExpectedAt ?? timestamp + 120,
	};
}

export class NotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'NotFoundError';
	}
}

export class ImageNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ImageNotFoundError';
	}
}

export class PreConditionNotMetError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PreConditionNotMetError';
	}
}
