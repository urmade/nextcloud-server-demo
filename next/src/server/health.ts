export type HealthStatus = 'ok';

export interface HealthPayload {
	status: HealthStatus;
	service: string;
}

export interface ReadyPayload {
	ready: boolean;
	service: string;
}

const SERVICE_NAME = 'nextcloud-next';

export function getHealthPayload(): HealthPayload {
	return {
		status: 'ok',
		service: SERVICE_NAME,
	};
}

export function getReadyPayload(): ReadyPayload {
	return {
		ready: true,
		service: SERVICE_NAME,
	};
}
