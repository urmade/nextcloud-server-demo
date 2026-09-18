import {
	handleDeleteMultiplePreferences,
	handleSetMultiplePreferences,
} from '@/src/server/provisioning/preferences';

export async function POST(
	request: Request,
	context: { params: Promise<{ appId: string }> },
) {
	const { appId } = await context.params;

	return handleSetMultiplePreferences(request, appId);
}

export async function DELETE(
	request: Request,
	context: { params: Promise<{ appId: string }> },
) {
	const { appId } = await context.params;
	const search = new URL(request.url).search;

	return handleDeleteMultiplePreferences(request, appId, search.startsWith('?') ? search.slice(1) : search);
}
