import { handleGetViewConfigs, handleSetViewConfig } from '@/src/server/files/api';

export async function GET(request: Request) {
	return handleGetViewConfigs(request);
}

export async function PUT(request: Request) {
	return handleSetViewConfig(request);
}

