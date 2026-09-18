import {
	handleFilenamesGetStatus,
	handleFilenamesSanitize,
	handleFilenamesStopSanitization,
} from '@/src/server/files/filenames';

export function GET(request: Request) {
	return handleFilenamesGetStatus(request);
}

export async function POST(request: Request) {
	return handleFilenamesSanitize(request);
}

export function DELETE(request: Request) {
	return handleFilenamesStopSanitization(request);
}
