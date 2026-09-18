import { handleTwoFactorEnable } from '@/src/server/two-factor/api';

export async function POST(request: Request) {
	return await handleTwoFactorEnable(request);
}
