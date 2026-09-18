import { handleOpenMetricsExport } from '@/src/server/ocs/public-leftovers';

export async function GET(request: Request) {
	return handleOpenMetricsExport(request);
}
