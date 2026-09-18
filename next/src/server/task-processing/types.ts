export type TaskProcessingStatus =
	| 'STATUS_CANCELLED'
	| 'STATUS_FAILED'
	| 'STATUS_SUCCESSFUL'
	| 'STATUS_RUNNING'
	| 'STATUS_SCHEDULED'
	| 'STATUS_UNKNOWN';

export interface TaskProcessingShapeDescriptor {
	name: string;
	description: string;
	type: string;
}

export interface TaskProcessingTaskType {
	name: string;
	description: string;
	inputShape: Record<string, TaskProcessingShapeDescriptor>;
	inputShapeEnumValues: Record<string, Array<{ name: string; value: string }>>;
	inputShapeDefaults: Record<string, number | string>;
	optionalInputShape: Record<string, TaskProcessingShapeDescriptor>;
	optionalInputShapeEnumValues: Record<string, Array<{ name: string; value: string }>>;
	optionalInputShapeDefaults: Record<string, number | string>;
	outputShape: Record<string, TaskProcessingShapeDescriptor>;
	outputShapeEnumValues: Record<string, Array<{ name: string; value: string }>>;
	optionalOutputShape: Record<string, TaskProcessingShapeDescriptor>;
	optionalOutputShapeEnumValues: Record<string, Array<{ name: string; value: string }>>;
}

export type TaskProcessingIo = Record<string, number | string | number[] | string[]>;

export interface TaskProcessingTask {
	id: number;
	lastUpdated: number;
	type: string;
	status: TaskProcessingStatus;
	userId: string | null;
	appId: string;
	input: TaskProcessingIo;
	output: TaskProcessingIo | null;
	customId: string | null;
	completionExpectedAt: number | null;
	progress: number | null;
	scheduledAt: number | null;
	startedAt: number | null;
	endedAt: number | null;
	allowCleanup: boolean;
	includeWatermark: boolean;
	userFacingErrorMessage: string | null;
	preferStreaming: boolean;
}

export interface ScheduleTaskRequest {
	input: TaskProcessingIo;
	type: string;
	appId: string;
	customId?: string;
	webhookUri?: string | null;
	webhookMethod?: string | null;
	includeWatermark?: boolean;
	preferStreaming?: boolean;
}
