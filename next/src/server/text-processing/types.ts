export type TextProcessingStatus = 0 | 1 | 2 | 3 | 4;

export type TextProcessingTaskTypeEntry = {
	id: string;
	name: string;
	description: string;
};

export type TextProcessingTask = {
	id: number | null;
	type: string;
	status: TextProcessingStatus;
	userId: string | null;
	appId: string;
	input: string;
	output: string | null;
	identifier: string;
	completionExpectedAt: number | null;
};

export type ScheduleTextProcessingRequest = {
	input: string;
	type: string;
	appId: string;
	identifier?: string;
};
