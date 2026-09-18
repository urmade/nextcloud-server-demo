import { resetBirthdayCalendarStore } from '@/src/server/dav/birthday-calendar-store';
import { getParityEnv } from '../env';

export async function resetParityBirthdayStores(): Promise<void> {
	resetBirthdayCalendarStore();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-dav-birthday-store`, {
		method: 'POST',
	});

	if (!response.ok && response.status !== 404) {
		throw new Error(`Failed to reset birthday calendar store on the Next.js server (${response.status})`);
	}
}
