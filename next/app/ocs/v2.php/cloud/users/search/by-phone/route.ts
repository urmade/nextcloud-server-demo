import { handleSearchByPhoneNumbers } from '@/src/server/provisioning/phone-search';

export async function POST(request: Request) {
	return handleSearchByPhoneNumbers(request);
}
