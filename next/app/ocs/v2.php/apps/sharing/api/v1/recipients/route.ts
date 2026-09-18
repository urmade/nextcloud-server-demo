import { handleSearchRecipients } from '@/src/server/sharing/api-v1';

export function GET(request: Request) {
	return handleSearchRecipients(request);
}
