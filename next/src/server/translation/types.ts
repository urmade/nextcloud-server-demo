/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export type LanguageTuple = {
	from: string;
	fromLabel: string;
	to: string;
	toLabel: string;
};

export type TranslateRequest = {
	text: string;
	fromLanguage?: string | null;
	toLanguage: string;
};
