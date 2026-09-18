import {
	handleDeletePreference,
	handleSetPreference,
} from '@/src/server/provisioning/preferences';

export async function POST(
	request: Request,
	context: { params: Promise<{ appId: string; configKey: string }> },
) {
	const { appId, configKey } = await context.params;

	return handleSetPreference(request, appId, configKey);
}

export async function DELETE(
	request: Request,
	context: { params: Promise<{ appId: string; configKey: string }> },
) {
	const { appId, configKey } = await context.params;

	return handleDeletePreference(request, appId, configKey);
}
