import { resetInvitationHtmlStore } from '@/src/server/dav/invitation-html-store';
import { getParityEnv } from '../env';

export async function resetParityInvitationHtmlStores(): Promise<void> {
	resetInvitationHtmlStore();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-dav-invitation-html-store`, {
		method: 'POST',
	});

	if (!response.ok && response.status !== 404) {
		throw new Error(`Failed to reset invitation-html store on the Next.js server (${response.status})`);
	}
}
