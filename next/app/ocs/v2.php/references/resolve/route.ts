import { handleResolveMany, handleResolveOne } from '@/src/server/reference/api';

export async function GET(request: Request) {
	return await handleResolveOne(request);
}

export async function POST(request: Request) {
	return await handleResolveMany(request);
}
