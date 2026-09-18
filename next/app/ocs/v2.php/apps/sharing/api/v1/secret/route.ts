import { handleGenerateSecret } from '@/src/server/sharing/api-v1';

export function GET(request: Request) {
	return handleGenerateSecret(request);
}
