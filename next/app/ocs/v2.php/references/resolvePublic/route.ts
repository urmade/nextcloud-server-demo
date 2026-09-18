import { handleResolveOnePublic, handleResolvePublicMany } from '@/src/server/reference/api';

export async function GET(request: Request) {
	return await handleResolveOnePublic(request);
}

export async function POST(request: Request) {
	return await handleResolvePublicMany(request);
}
