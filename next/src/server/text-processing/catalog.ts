import type { TextProcessingTaskTypeEntry } from '@/src/server/text-processing/types';

export const PARITY_FREE_PROMPT_TYPE = 'OCP\\TextProcessing\\FreePromptTaskType';
export const PARITY_SUMMARY_TYPE = 'OCP\\TextProcessing\\SummaryTaskType';
export const PARITY_HEADLINE_TYPE = 'OCP\\TextProcessing\\HeadlineTaskType';
export const PARITY_TOPICS_TYPE = 'OCP\\TextProcessing\\TopicsTaskType';
export const PARITY_TEXT_PROCESSING_APP_ID = 'core';

const PARITY_TASK_TYPES: TextProcessingTaskTypeEntry[] = [
	{
		id: PARITY_FREE_PROMPT_TYPE,
		name: 'Free prompt',
		description: 'Runs an arbitrary prompt through the language model.',
	},
	{
		id: PARITY_SUMMARY_TYPE,
		name: 'Summarize',
		description: 'Summarizes a text.',
	},
	{
		id: PARITY_HEADLINE_TYPE,
		name: 'Generate headline',
		description: 'Generates a possible headline for a text.',
	},
	{
		id: PARITY_TOPICS_TYPE,
		name: 'Extract topics',
		description: 'Extracts topics from a text.',
	},
];

export function getAvailableTextProcessingTaskTypes(): TextProcessingTaskTypeEntry[] {
	return structuredClone(PARITY_TASK_TYPES);
}

export function isKnownTextProcessingTaskType(type: string): boolean {
	return PARITY_TASK_TYPES.some((entry) => entry.id === type);
}

export function isTextProcessingProviderAvailable(): boolean {
	const value = process.env.NC_PARITY_TEXT_PROCESSING_PROVIDER?.trim().toLowerCase();

	return value !== 'false' && value !== '0';
}
