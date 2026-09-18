import { handleAcceptFederatedCalendar, handleDeclineFederatedCalendar } from '@/src/server/dav/cal-ocs';

export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const { id } = await context.params;

	return handleAcceptFederatedCalendar(request, Number.parseInt(id, 10));
}

export async function DELETE(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const { id } = await context.params;

	return handleDeclineFederatedCalendar(request, Number.parseInt(id, 10));
}
