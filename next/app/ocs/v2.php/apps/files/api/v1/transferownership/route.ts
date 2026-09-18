import { handleTransferOwnershipTransfer } from '@/src/server/files/transfer-ownership';

export async function POST(request: Request) {
	return handleTransferOwnershipTransfer(request);
}
