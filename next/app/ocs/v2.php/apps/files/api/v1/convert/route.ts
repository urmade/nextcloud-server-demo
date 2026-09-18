import { handleConversionConvert } from '@/src/server/files/conversion';

export async function POST(request: Request) {
	return handleConversionConvert(request);
}
