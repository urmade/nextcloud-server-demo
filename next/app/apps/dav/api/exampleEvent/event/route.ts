import {
	handleDeleteExampleEvent,
	handleDownloadExampleEvent,
	handleUploadExampleEvent,
} from '@/src/server/dav/example-content';

export async function GET(request: Request) {
	return handleDownloadExampleEvent(request);
}

export async function POST(request: Request) {
	return handleUploadExampleEvent(request);
}

export async function DELETE(request: Request) {
	return handleDeleteExampleEvent(request);
}
