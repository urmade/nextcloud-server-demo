import { getParityEnv } from '../env';

export async function setParityWebUpdaterConfig(config: {
	needsUpgrade?: boolean;
	disableWeb?: boolean;
}): Promise<void> {
	const { setParityWebUpdaterRuntimeConfig } = await import('@/src/server/ocs/web-updater-config');
	setParityWebUpdaterRuntimeConfig(config);

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/set-web-updater-config`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(config),
	});

	if (!response.ok) {
		throw new Error(`Failed to set web updater config (${response.status})`);
	}
}

export async function resetParityWebUpdaterConfig(): Promise<void> {
	const { resetParityWebUpdaterRuntimeConfig } = await import('@/src/server/ocs/web-updater-config');
	resetParityWebUpdaterRuntimeConfig();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/set-web-updater-config`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ reset: true }),
	});

	if (!response.ok) {
		throw new Error(`Failed to reset web updater config (${response.status})`);
	}
}

export function parseSseEventTypes(body: string): string[] {
	const types: string[] = [];

	for (const block of body.split('\n\n')) {
		const trimmed = block.trim();

		if (!trimmed) {
			continue;
		}

		for (const line of trimmed.split('\n')) {
			if (line.startsWith('event: ')) {
				types.push(line.slice('event: '.length));
			}
		}
	}

	return types;
}
