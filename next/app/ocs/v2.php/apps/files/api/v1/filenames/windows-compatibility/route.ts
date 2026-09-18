import { handleFilenamesToggleWindowsSupport } from '@/src/server/files/filenames';

export async function POST(request: Request) {
	return handleFilenamesToggleWindowsSupport(request);
}
