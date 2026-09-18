import { handleCropImagePreviews } from '@/src/server/files/api';

export async function POST(request: Request) {
	return handleCropImagePreviews(request);
}
