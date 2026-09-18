import {
	handleExternalSharesDestroy,
	handleExternalSharesMissingMethod,
} from '@/src/server/files_sharing/external-shares-api';

export function GET() {
	return handleExternalSharesMissingMethod();
}

export function PUT() {
	return handleExternalSharesMissingMethod();
}

export async function DELETE(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const { id } = await context.params;

	return handleExternalSharesDestroy(request, id);
}
