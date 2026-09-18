/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { handleWebUpdaterUpdate } from '@/src/server/ocs/web-updater';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';

async function responseToSnapshot(response: Response): Promise<ParityResponseSnapshot> {
	const rawBody = await response.text();

	return snapshotResponse(response, rawBody);
}

export async function handleWebUpdaterMock(
	pathname: string,
	_options: ParityRequestOptions,
): Promise<ParityResponseSnapshot | null> {
	if (pathname !== '/ocs/v2.php/core/update') {
		return null;
	}

	return responseToSnapshot(handleWebUpdaterUpdate());
}

export function isWebUpdaterMockPath(pathname: string, method = 'GET'): boolean {
	return method.toUpperCase() === 'GET' && pathname === '/ocs/v2.php/core/update';
}
