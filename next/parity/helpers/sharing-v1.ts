import { setUnifiedApiEnabled } from '@/src/server/sharing/config';
import {
	resetSharingV1Store,
	seedSharingShare,
	type SharingShareRecord,
} from '@/src/server/sharing/store';
import { getParityEnv } from '../env';
import { cookieJarToHeader } from './cookies';
import { OCS_JSON_HEADERS } from './session';

const SHARE_PATH = '/ocs/v2.php/apps/sharing/api/v1/share?format=json';

export async function resetParitySharingV1Stores(): Promise<void> {
	resetSharingV1Store();

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/reset-sharing-v1-store`, {
		method: 'POST',
	});

	if (!response.ok) {
		throw new Error(`Failed to reset Next.js sharing v1 store (${response.status})`);
	}
}

export async function seedShareOnBothSides(jar: Record<string, string>): Promise<string> {
	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}${SHARE_PATH}`, {
		method: 'POST',
		headers: {
			...OCS_JSON_HEADERS,
			cookie: cookieJarToHeader(jar) ?? '',
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to seed sharing share (${response.status})`);
	}

	const body = await response.json() as {
		ocs: {
			data: {
				id: string;
				owner: { user_id: string };
				last_updated: string;
				state: SharingShareRecord['state'];
				user_status: SharingShareRecord['userStatus'];
			};
		};
	};
	const share = body.ocs.data;

	seedSharingShare({
		id: share.id,
		ownerId: share.owner.user_id,
		lastUpdatedMs: share.last_updated,
		state: share.state,
		userStatus: share.user_status,
	});

	return share.id;
}

export async function enableSharingV1OnBothSides(): Promise<void> {
	setUnifiedApiEnabled(true);

	const env = getParityEnv();
	const response = await fetch(`${env.newBaseUrl}/api/parity/set-sharing-v1-config`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({ unifiedApiEnabled: true }),
	});

	if (!response.ok) {
		throw new Error(`Failed to enable sharing v1 config (${response.status})`);
	}
}
