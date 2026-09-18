import { resetInvitationHtmlStore } from '@/src/server/dav/invitation-html-store';

export async function POST() {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	resetInvitationHtmlStore();

	return new Response(null, { status: 204 });
}
