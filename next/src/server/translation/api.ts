/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
	canDetectLanguage,
	getTranslationLanguages,
	hasLanguagePair,
	isTranslationProviderAvailable,
	translateText,
} from '@/src/server/translation/catalog';
import type { TranslateRequest } from '@/src/server/translation/types';
import {
	ocsFailureResponse,
	ocsSuccessResponse,
	parseOcsVersion,
} from '@/src/server/ocs/respond';

const MAX_TEXT_LENGTH = 64_000;

function parseJsonBody<T>(request: Request): Promise<T | null> {
	return request.json().catch(() => null);
}

export async function handleTranslationLanguages(request: Request): Promise<Response> {
	return ocsSuccessResponse(
		{
			languages: getTranslationLanguages(),
			languageDetection: canDetectLanguage(),
		},
		parseOcsVersion(request),
	);
}

export async function handleTranslationTranslate(request: Request): Promise<Response> {
	const body = await parseJsonBody<TranslateRequest>(request);
	const ocsVersion = parseOcsVersion(request);

	if (!body || typeof body.text !== 'string' || typeof body.toLanguage !== 'string') {
		return ocsFailureResponse(ocsVersion, 400, '', { message: 'Could not detect language' });
	}

	if (body.text.length > MAX_TEXT_LENGTH) {
		return ocsFailureResponse(ocsVersion, 400, '', { message: 'Input text is too long' });
	}

	if (!isTranslationProviderAvailable()) {
		return ocsFailureResponse(ocsVersion, 412, '', { message: 'No translation provider available' });
	}

	let fromLanguage = body.fromLanguage ?? null;

	if (fromLanguage === null) {
		if (!canDetectLanguage()) {
			return ocsFailureResponse(ocsVersion, 400, '', { message: 'Could not detect language' });
		}

		fromLanguage = 'en';
	}

	if (fromLanguage === body.toLanguage) {
		return ocsSuccessResponse(
			{
				text: body.text,
				from: fromLanguage,
			},
			ocsVersion,
		);
	}

	if (!hasLanguagePair(fromLanguage, body.toLanguage)) {
		return ocsFailureResponse(ocsVersion, 400, '', {
			message: 'Unable to translate',
			from: fromLanguage,
		});
	}

	return ocsSuccessResponse(
		{
			text: translateText(body.text, fromLanguage, body.toLanguage),
			from: fromLanguage,
		},
		ocsVersion,
	);
}
