/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { parityNeedsUpgrade, parityUpgradeDisableWeb } from '@/src/server/ocs/web-updater-config';

export type WebUpdaterEvent = {
	type: string;
	data: unknown;
};

export function buildWebUpdaterEvents(): WebUpdaterEvent[] {
	const events: WebUpdaterEvent[] = [
		{ type: 'success', data: 'Preparing update' },
	];

	if (!parityNeedsUpgrade()) {
		events.push({ type: 'notice', data: 'Already up to date' });
		events.push({ type: 'done', data: '' });
		events.push({ type: '__internal__', data: 'close' });

		return events;
	}

	if (parityUpgradeDisableWeb()) {
		events.push({
			type: 'failure',
			data: 'Please use the command line updater because updating via browser is disabled in your config.php.',
		});
		events.push({ type: '__internal__', data: 'close' });

		return events;
	}

	events.push({
		type: 'failure',
		data: 'Web upgrade is not available in parity mode.',
	});
	events.push({ type: '__internal__', data: 'close' });

	return events;
}

function formatSseEvent(type: string, data: unknown): string {
	const lines = [`event: ${type}`, `data: ${JSON.stringify(data)}`, '', ''];

	return lines.join('\n');
}

function formatWebUpdaterSseBody(events: WebUpdaterEvent[]): string {
	return events.map((event) => formatSseEvent(event.type, event.data)).join('');
}

export function handleWebUpdaterUpdate(): Response {
	const events = buildWebUpdaterEvents();
	const body = formatWebUpdaterSseBody(events);

	return new Response(body, {
		status: 200,
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			'x-accel-buffering': 'no',
		},
	});
}
