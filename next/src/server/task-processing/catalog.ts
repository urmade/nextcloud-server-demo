import type { TaskProcessingTaskType } from '@/src/server/task-processing/types';

export const PARITY_TEXT_TASK_TYPE_ID = 'core:text2text';
export const PARITY_FILE_TASK_TYPE_ID = 'parity:file-read';
export const PARITY_TASK_APP_ID = 'core';
export const PARITY_TEXT_PROVIDER_ID = PARITY_TEXT_TASK_TYPE_ID;
export const PARITY_FILE_PROVIDER_ID = PARITY_FILE_TASK_TYPE_ID;

const EMPTY_OBJECT = {} as Record<string, never>;

function textShape(name: string, description: string) {
	return {
		name,
		description,
		type: 'Text',
	};
}

function fileShape(name: string, description: string) {
	return {
		name,
		description,
		type: 'File',
	};
}

const PARITY_TASK_TYPES: Record<string, TaskProcessingTaskType> = {
	[PARITY_TEXT_TASK_TYPE_ID]: {
		name: 'Free text to text prompt',
		description: 'Runs an arbitrary prompt through a language model that returns a reply',
		inputShape: {
			input: textShape('Prompt', 'Describe a task that you want the assistant to do or ask a question'),
		},
		inputShapeEnumValues: EMPTY_OBJECT,
		inputShapeDefaults: EMPTY_OBJECT,
		optionalInputShape: EMPTY_OBJECT,
		optionalInputShapeEnumValues: EMPTY_OBJECT,
		optionalInputShapeDefaults: EMPTY_OBJECT,
		outputShape: {
			output: textShape('Generated text', 'The generated text'),
		},
		outputShapeEnumValues: EMPTY_OBJECT,
		optionalOutputShape: EMPTY_OBJECT,
		optionalOutputShapeEnumValues: EMPTY_OBJECT,
	},
	[PARITY_FILE_TASK_TYPE_ID]: {
		name: 'Parity file read',
		description: 'Fixture task type with a file input slot for file-content parity',
		inputShape: {
			file: fileShape('File', 'File to read'),
		},
		inputShapeEnumValues: EMPTY_OBJECT,
		inputShapeDefaults: EMPTY_OBJECT,
		optionalInputShape: EMPTY_OBJECT,
		optionalInputShapeEnumValues: EMPTY_OBJECT,
		optionalInputShapeDefaults: EMPTY_OBJECT,
		outputShape: EMPTY_OBJECT,
		outputShapeEnumValues: EMPTY_OBJECT,
		optionalOutputShape: EMPTY_OBJECT,
		optionalOutputShapeEnumValues: EMPTY_OBJECT,
	},
};

export function getAvailableTaskTypes(): Record<string, TaskProcessingTaskType> {
	return structuredClone(PARITY_TASK_TYPES);
}

export function getTaskType(taskTypeId: string): TaskProcessingTaskType | undefined {
	return PARITY_TASK_TYPES[taskTypeId];
}

export function isFileShapeType(type: string): boolean {
	return type === 'File' || type === 'Image' || type === 'Audio' || type === 'Video';
}

export function getPreferredProviderId(taskTypeId: string): string | null {
	if (taskTypeId in PARITY_TASK_TYPES) {
		return taskTypeId;
	}

	return null;
}

export function intersectTaskTypesAndProviders(
	taskTypeIds: string[],
	providerIds: string[],
): { providerIds: string[]; taskTypeIds: string[] } {
	const providerIdsBasedOnTaskTypes = taskTypeIds
		.map((taskTypeId) => getPreferredProviderId(taskTypeId))
		.filter((providerId): providerId is string => providerId !== null);

	const possibleProviderIds = [...new Set(providerIdsBasedOnTaskTypes)]
		.filter((providerId) => providerIds.includes(providerId));

	const possibleTaskTypeIds = taskTypeIds.filter((taskTypeId) => {
		const providerForTaskType = getPreferredProviderId(taskTypeId);

		return providerForTaskType !== null && possibleProviderIds.includes(providerForTaskType);
	});

	return {
		providerIds: possibleProviderIds,
		taskTypeIds: possibleTaskTypeIds,
	};
}
