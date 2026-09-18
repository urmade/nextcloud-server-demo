import {
	handleDeleteShare,
	handleGetShare,
	handleGetShareMethodNotAllowed,
} from '@/src/server/sharing/api-v1';

export function GET(request: Request) {
	return handleGetShareMethodNotAllowed(request);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;

	return handleGetShare(request, id);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;

	return handleDeleteShare(request, id);
}
