import { handleTwoFactorState } from '@/src/server/two-factor/api';

export function GET(request: Request) {
	return handleTwoFactorState(request);
}
