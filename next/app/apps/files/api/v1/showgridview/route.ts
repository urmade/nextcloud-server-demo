import { handleGetGridView, handleShowGridView } from '@/src/server/files/api';

export async function GET(request: Request) {
	return handleGetGridView(request);
}

export async function POST(request: Request) {
	return handleShowGridView(request);
}

