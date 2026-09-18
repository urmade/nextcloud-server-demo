import { handleWebUpdaterUpdate } from '@/src/server/ocs/web-updater';

export async function GET() {
	return handleWebUpdaterUpdate();
}
