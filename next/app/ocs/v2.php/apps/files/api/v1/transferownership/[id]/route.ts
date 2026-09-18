import {
	handleTransferOwnershipAccept,
	handleTransferOwnershipReject,
} from '@/src/server/files/transfer-ownership';

export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const { id } = await context.params;

	return handleTransferOwnershipAccept(request, Number.parseInt(id, 10));
}

export async function DELETE(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const { id } = await context.params;

	return handleTransferOwnershipReject(request, Number.parseInt(id, 10));
}
