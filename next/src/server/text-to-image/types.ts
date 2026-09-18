export type TextToImageStatus = 0 | 1 | 2 | 3 | 4;

export type TextToImageTask = {
	id: number | null;
	status: TextToImageStatus;
	userId: string | null;
	appId: string;
	input: string;
	identifier: string | null;
	numberOfImages: number;
	completionExpectedAt: number | null;
};

export type ScheduleTextToImageRequest = {
	input: string;
	appId: string;
	identifier?: string;
	numberOfImages?: number;
};
