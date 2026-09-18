/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { LanguageTuple } from '@/src/server/translation/types';

// Mirrors OCA\Testing\Provider\FakeTranslationProvider::getAvailableLanguages().
const PARITY_LANGUAGE_CATALOG: LanguageTuple[] = [
	{ from: 'de', fromLabel: 'German', to: 'en', toLabel: 'English' },
	{ from: 'en', fromLabel: 'English', to: 'de', toLabel: 'German' },
];

export function isTranslationProviderAvailable(): boolean {
	const value = process.env.NC_PARITY_TRANSLATION_PROVIDER?.trim().toLowerCase();

	return value !== 'false' && value !== '0';
}

export function canDetectLanguage(): boolean {
	return false;
}

export function getTranslationLanguages(): LanguageTuple[] {
	if (!isTranslationProviderAvailable()) {
		return [];
	}

	return structuredClone(PARITY_LANGUAGE_CATALOG);
}

export function hasLanguagePair(fromLanguage: string, toLanguage: string): boolean {
	return PARITY_LANGUAGE_CATALOG.some(
		(tuple) => tuple.from === fromLanguage && tuple.to === toLanguage,
	);
}

export function translateText(text: string, fromLanguage: string, toLanguage: string): string {
	return mbStrRev(text);
}

function mbStrRev(text: string): string {
	let reversed = '';

	for (let index = text.length; index >= 0; index -= 1) {
		reversed += text.charAt(index);
	}

	return reversed;
}
