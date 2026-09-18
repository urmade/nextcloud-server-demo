import {
	handleExternalSharesCreate,
	handleExternalSharesIndex,
} from '@/src/server/files_sharing/external-shares-api';

export function GET(request: Request) {
	return handleExternalSharesIndex(request);
}

export async function POST(request: Request) {
	return handleExternalSharesCreate(request);
}
